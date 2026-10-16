package com.megagoglio.rfidgestao.rfidreader

import android.util.Log
import com.uk.tsl.rfid.asciiprotocol.AsciiCommander
import com.uk.tsl.rfid.asciiprotocol.commands.AbortCommand
import com.uk.tsl.rfid.asciiprotocol.commands.AlertCommand
import com.uk.tsl.rfid.asciiprotocol.commands.InventoryCommand
import com.uk.tsl.rfid.asciiprotocol.enumerations.AlertDuration
import com.uk.tsl.rfid.asciiprotocol.enumerations.TriState
import com.uk.tsl.rfid.asciiprotocol.responders.ICommandResponseLifecycleDelegate
import com.uk.tsl.rfid.asciiprotocol.responders.ITransponderReceivedDelegate
import com.uk.tsl.rfid.asciiprotocol.responders.TransponderData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Uma leitura física de tag (a mesma tag gera várias durante um scan). */
data class TagRead(val epc: String, val rssi: Int?)

/**
 * Inventário RFID: configura o leitor, escuta as tags e entrega cada leitura a [onTagRead].
 *
 * Recorte de RFID_Reader-Android_App/.../reader/InventoryController.kt só com o
 * inventário de EPC — sem filtro de EPC e sem TID (fora do escopo da POC). Os dois
 * detalhes do SDK de que ele depende continuam valendo:
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

    /** Comandos do SDK nunca na thread principal (ver runOffUIThread() em ModelBase.java). */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var continuousScanEnabled = false
    private var anyTagSeenInPass = false
    private var lastAlertAtNanos = 0L

    /** Scan contínuo por software ligado (o gatilho físico não passa por aqui). */
    val isScanning: Boolean get() = continuousScanEnabled

    /** Emite configuração e dispara os scans. */
    private val inventoryCommand = InventoryCommand().apply {
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

    private companion object {
        const val TAG = "RfidReaderInventory"
        const val ALERT_MIN_INTERVAL_NANOS = 400L * 1000 * 1000
    }
}
