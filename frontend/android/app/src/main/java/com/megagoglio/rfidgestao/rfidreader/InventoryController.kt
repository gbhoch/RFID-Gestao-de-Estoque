package com.megagoglio.rfidgestao.rfidreader

import android.util.Log
import com.uk.tsl.rfid.asciiprotocol.AsciiCommander
import com.uk.tsl.rfid.asciiprotocol.commands.AbortCommand
import com.uk.tsl.rfid.asciiprotocol.commands.AlertCommand
import com.uk.tsl.rfid.asciiprotocol.commands.InventoryCommand
import com.uk.tsl.rfid.asciiprotocol.enumerations.AlertDuration
import com.uk.tsl.rfid.asciiprotocol.enumerations.Databank
import com.uk.tsl.rfid.asciiprotocol.enumerations.QuerySelect
import com.uk.tsl.rfid.asciiprotocol.enumerations.SelectAction
import com.uk.tsl.rfid.asciiprotocol.enumerations.SelectTarget
import com.uk.tsl.rfid.asciiprotocol.enumerations.TriState
import com.uk.tsl.rfid.asciiprotocol.parameters.SelectControlParameters
import com.uk.tsl.rfid.asciiprotocol.parameters.SelectMaskParameters
import com.uk.tsl.rfid.asciiprotocol.responders.ICommandResponseLifecycleDelegate
import com.uk.tsl.rfid.asciiprotocol.responders.ITransponderReceivedDelegate
import com.uk.tsl.rfid.asciiprotocol.responders.TransponderData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Uma leitura física de tag (a mesma tag gera várias durante um scan). */
data class TagRead(val epc: String, val rssi: Int?)

/**
 * Inventário RFID: configura o leitor, escuta as tags e entrega cada leitura a [onTagRead].
 *
 * Recorte de RFID_Reader-Android_App/.../reader/InventoryController.kt com o inventário
 * de EPC e o filtro de EPC (sem TID). Os dois detalhes do SDK de que ele depende
 * continuam valendo:
 *
 * 1. São necessários DOIS [InventoryCommand] distintos: um *emite* configuração e
 *    dispara scans ([inventoryCommand]); o outro é registrado como responder e apenas
 *    *escuta* ([inventoryResponder]).
 *
 * 2. `setCaptureNonLibraryResponses(true)` no responder é obrigatório. As leituras
 *    disparadas pelo GATILHO FÍSICO do leitor não são resposta a nenhum comando que o
 *    app enviou; sem essa flag elas não chegam ao app.
 */
class InventoryController(
    private val commander: AsciiCommander,
    private val onTagRead: (TagRead) -> Unit,
    private val onScanningChanged: (Boolean) -> Unit,
) {

    /**
     * Comandos do SDK nunca na thread principal (ver runOffUIThread() em ModelBase.java).
     * Uma thread só: configuração, filtro e scan mexem no mesmo [inventoryCommand] e
     * precisam sair na ordem em que foram pedidos.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))

    @Volatile
    private var continuousScanEnabled = false
    private var anyTagSeenInPass = false
    private var lastAlertAtNanos = 0L

    /** Scan contínuo por software ligado (o gatilho físico não passa por aqui). */
    val isScanning: Boolean get() = continuousScanEnabled

    /** Filtro em vigor; null = todas as tags. Ver [EpcPrefixFilter] para as duas camadas. */
    @Volatile
    var activeFilter: EpcPrefixFilter? = null
        private set

    /** Emite configuração e dispara os scans. */
    private val inventoryCommand = LoggingInventoryCommand().apply {
        setResetParameters(TriState.YES)
        // O beep é dado pelo app, não pelo leitor, para poder respeitar o intervalo mínimo.
        useAlert = TriState.NO
    }

    /** Registrado como responder: captura as respostas de inventário. */
    private val inventoryResponder = InventoryCommand()

    private val alertCommand = AlertCommand().apply {
        duration = AlertDuration.SHORT
    }

    private var respondersAttached = false

    init {
        // Captura também as respostas que não vieram de comandos do app — é isso que faz
        // o gatilho físico do leitor funcionar.
        inventoryResponder.setCaptureNonLibraryResponses(true)

        inventoryResponder.transponderReceivedDelegate =
            ITransponderReceivedDelegate { transponder, _ -> publish(transponder) }

        inventoryResponder.responseLifecycleDelegate = object : ICommandResponseLifecycleDelegate {
            override fun responseBegan() {
                anyTagSeenInPass = false
            }

            override fun responseEnded() {
                if (anyTagSeenInPass) {
                    beep()
                }
                if (continuousScanEnabled) {
                    // O scan contínuo é o app reemitindo o comando a cada resposta concluída.
                    commander.executeCommand(inventoryCommand)
                } else {
                    inventoryCommand.takeNoAction = TriState.NO
                }
            }
        }
    }

    private fun publish(transponder: TransponderData) {
        val epc = transponder.epc ?: return
        // Segunda camada do filtro: o Select do leitor só cobre o prefixo comum.
        if (activeFilter?.matches(epc) == false) return
        anyTagSeenInPass = true
        onTagRead(TagRead(epc = epc, rssi = transponder.rssi))
    }

    // ------------------------------------------------------------- responders

    fun attach() {
        if (respondersAttached) return
        respondersAttached = true
        commander.addResponder(inventoryResponder)
    }

    fun detach() {
        if (!respondersAttached) return
        respondersAttached = false
        if (continuousScanEnabled) scanStop()
        commander.removeResponder(inventoryResponder)
    }

    // ---------------------------------------------------------- configuração

    /** Envia ao leitor quais campos devem vir em cada leitura. Chamar sempre que conectar. */
    fun applyConfiguration() = scope.launch {
        if (!commander.isConnected) return@launch
        runCatching {
            inventoryCommand.takeNoAction = TriState.YES
            inventoryCommand.setIncludeTransponderRssi(TriState.YES)
            inventoryCommand.setIncludeChecksum(TriState.YES)
            inventoryCommand.setIncludePC(TriState.YES)
            inventoryCommand.setIncludeDateTime(TriState.YES)
            commander.executeCommand(inventoryCommand)
        }.onFailure { Log.e(TAG, "Falha ao configurar o leitor", it) }
    }

    // ------------------------------------------------------------- filtro EPC

    /**
     * Aplica o filtro inclusivo [filter]. Os campos de Select ficam no [inventoryCommand],
     * que é reenviado a cada rodada do scan contínuo e a cada reconexão
     * ([applyConfiguration]); parado, ele é enviado já com takeNoAction para que o
     * GATILHO FÍSICO passe a usar o filtro sem esperar um scan por software.
     */
    fun applyEpcFilter(filter: EpcPrefixFilter) {
        // A camada do app vale já; a do leitor, assim que o comando sair.
        activeFilter = filter
        scope.launch {
            runCatching {
                val spec = filter.hardwareSpec
                if (spec != null) writeSelectFields(spec) else resetSelectFields()
                storeParametersIfIdle()
            }.onFailure { Log.e(TAG, "Falha ao aplicar filtro de EPC", it) }
        }
    }

    /** Remove o filtro de EPC: o leitor volta a reportar todas as tags. */
    fun clearEpcFilter() {
        activeFilter = null
        scope.launch {
            runCatching {
                resetSelectFields()
                storeParametersIfIdle()
            }.onFailure { Log.e(TAG, "Falha ao remover filtro de EPC", it) }
        }
    }

    /** Converte [spec] (caracteres hex) para os campos de select do SDK (bits). */
    private fun writeSelectFields(spec: EpcFilterSpec) {
        inventoryCommand.setSelectBank(Databank.ELECTRONIC_PRODUCT_CODE)
        inventoryCommand.setSelectOffset(EpcFilterSelectParams.offsetBits(spec))
        inventoryCommand.setSelectLength(EpcFilterSelectParams.lengthBits(spec))
        inventoryCommand.setSelectData(EpcFilterSelectParams.selectData(spec))

        // Semântica do filtro positivo ("só reporta quem casa"), confirmada no Javadoc
        // e no bytecode do SDK da TSL (Rfid.AsciiProtocol-Library/doc/ no app de
        // referência):
        //
        // - ASSERT_SET_A_NOT_DEASSERT_SET_B é a ação 000 do Gen2 (-sa0): quem casa fica
        //   com a flag SL asserted, quem não casa fica deasserted.
        // - SelectTarget.SELECTED (-stsl) faz o Select agir sobre a flag SL, e não sobre
        //   uma das sessões S0-S3.
        // - QuerySelect.SELECTED (-qlsl) faz a rodada responder só às tags com SL.
        // - setInventoryOnly(NO) (-iooff) é o que faz o leitor EXECUTAR o Select antes do
        //   inventário. Sem ele vale o default do leitor, que pula o Select: com -qlsl e
        //   nenhum Select, nenhuma tag tem SL e o inventário reporta zero, para qualquer
        //   máscara (o bug corrigido no app de referência em 22/09/2026). Como o comando
        //   manda -x a cada rodada, o valor fica no objeto e é reenviado em todas.
        inventoryCommand.setSelectAction(SelectAction.ASSERT_SET_A_NOT_DEASSERT_SET_B)
        inventoryCommand.setSelectTarget(SelectTarget.SELECTED)
        inventoryCommand.setQuerySelect(QuerySelect.SELECTED)
        inventoryCommand.setInventoryOnly(TriState.NO)
    }

    /**
     * Volta aos defaults do select + QuerySelect.ALL — confirmado em campo (22/09/2026)
     * que basta: as tags reaparecem na hora, sem flag SL presa.
     */
    private fun resetSelectFields() {
        SelectMaskParameters.setDefaultParametersFor(inventoryCommand)
        SelectControlParameters.setDefaultParametersFor(inventoryCommand)
        inventoryCommand.setQuerySelect(QuerySelect.ALL)
        // Sem filtro não há Select a executar: inventário puro, sem uma operação à toa.
        inventoryCommand.setInventoryOnly(TriState.YES)
    }

    /**
     * Em scan contínuo a próxima rodada já sai com os campos novos; reenviar agora
     * colidiria com a rodada em curso. Parado, grava os parâmetros no leitor.
     */
    private fun storeParametersIfIdle() {
        if (continuousScanEnabled || !commander.isConnected) return
        inventoryCommand.takeNoAction = TriState.YES
        commander.executeCommand(inventoryCommand)
    }

    // ------------------------------------------------------------------ scan

    /** Inicia o scan contínuo por software (alternativa ao gatilho físico). */
    fun scanStart() = scope.launch {
        if (!commander.isConnected) return@launch
        continuousScanEnabled = true
        onScanningChanged(true)
        inventoryCommand.takeNoAction = TriState.NO
        runCatching { commander.executeCommand(inventoryCommand) }
            .onFailure { Log.e(TAG, "Falha ao iniciar o scan", it) }
    }

    fun scanStop() {
        val wasScanning = continuousScanEnabled
        continuousScanEnabled = false
        inventoryCommand.takeNoAction = TriState.YES
        if (wasScanning) onScanningChanged(false)

        scope.launch {
            if (!commander.isConnected) return@launch
            runCatching { commander.executeCommand(AbortCommand()) }
                .onFailure { Log.e(TAG, "Falha ao abortar o scan", it) }
        }
    }

    /** O leitor caiu: não há o que abortar, só zerar o estado do scan por software. */
    fun onReaderDisconnected() {
        if (!continuousScanEnabled) return
        continuousScanEnabled = false
        inventoryCommand.takeNoAction = TriState.YES
        onScanningChanged(false)
    }

    /**
     * Nos leitores 11xx, disparar o AlertCommand em sequência rápida trava o buzzer
     * em execução contínua. O intervalo mínimo evita esse defeito de hardware.
     */
    private fun beep() {
        val now = System.nanoTime()
        if (now - lastAlertAtNanos <= ALERT_MIN_INTERVAL_NANOS) return
        lastAlertAtNanos = now
        commander.executeCommand(alertCommand)
    }

    /**
     * TEMPORÁRIO (diagnóstico do Select, como no app de referência): loga a linha ASCII
     * exata de cada envio — `adb logcat -s RfidReaderInventory`. Com filtro, a linha deve
     * conter `-qlsl -stsl -sa0 -sbepc -so0020 -slNN -sdHEX -iooff`.
     */
    private class LoggingInventoryCommand : InventoryCommand() {
        override fun buildCommandLine(sb: StringBuilder) {
            super.buildCommandLine(sb)
            Log.d(TAG, "TX: $sb")
        }
    }

    private companion object {
        const val TAG = "RfidReaderInventory"
        const val ALERT_MIN_INTERVAL_NANOS = 400L * 1000 * 1000
    }
}
