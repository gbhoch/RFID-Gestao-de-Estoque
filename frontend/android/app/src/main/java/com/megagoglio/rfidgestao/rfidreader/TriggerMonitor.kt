package com.megagoglio.rfidgestao.rfidreader

import android.util.Log
import com.uk.tsl.rfid.asciiprotocol.AsciiCommander
import com.uk.tsl.rfid.asciiprotocol.commands.SwitchActionCommand
import com.uk.tsl.rfid.asciiprotocol.enumerations.SwitchState
import com.uk.tsl.rfid.asciiprotocol.enumerations.TriState
import com.uk.tsl.rfid.asciiprotocol.responders.ISwitchStateReceivedDelegate
import com.uk.tsl.rfid.asciiprotocol.responders.SwitchResponder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Estado do gatilho físico do leitor (pressionado/solto), entregue a [onTriggerChanged].
 *
 * O gatilho continua disparando o inventário sozinho, pelo próprio leitor — isso já
 * funcionava na POC graças ao `setCaptureNonLibraryResponses` do [InventoryController].
 * O que faltava era SABER que ele está apertado, para a tela mostrar "lendo":
 *
 * - [SwitchResponder] decodifica as notificações `SW:` assíncronas do leitor;
 * - o leitor só as envia depois de um [SwitchActionCommand] com
 *   `setAsynchronousReportingEnabled(YES)` (`.sa -asyon`). Como toda configuração, ela
 *   não sobrevive a uma reconexão: [enableReporting] a cada CONNECTED.
 *
 * As ações de single/double press ficam NOT_SPECIFIED (não são enviadas), para não mudar
 * o que o gatilho faz hoje.
 */
class TriggerMonitor(
    private val commander: AsciiCommander,
    private val onTriggerChanged: (Boolean) -> Unit,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val switchResponder = SwitchResponder()
    private var attached = false

    @Volatile
    var isPressed: Boolean = false
        private set

    init {
        // Chamado fora da thread de UI (ver Javadoc de ISwitchStateReceivedDelegate).
        switchResponder.switchStateReceivedDelegate = ISwitchStateReceivedDelegate { state ->
            when (state) {
                SwitchState.SINGLE, SwitchState.DOUBLE -> update(true)
                SwitchState.OFF -> update(false)
                else -> Unit
            }
        }
    }

    /**
     * Registra o responder. Por garantia, chamar ANTES de anexar o responder do
     * inventário, que captura respostas que não vieram do app: assim o `SW:` passa
     * primeiro por aqui.
     */
    fun attach() {
        if (attached) return
        attached = true
        commander.addResponder(switchResponder)
    }

    fun detach() {
        if (!attached) return
        attached = false
        commander.removeResponder(switchResponder)
    }

    /** Liga os avisos assíncronos do gatilho. Chamar sempre que conectar. */
    fun enableReporting() = scope.launch {
        if (!commander.isConnected) return@launch
        runCatching {
            val command = SwitchActionCommand.synchronousCommand()
            command.setAsynchronousReportingEnabled(TriState.YES)
            commander.executeCommand(command)
            if (!command.isSuccessful) {
                Log.w(TAG, "Leitor recusou .sa -asyon: ${command.errorCode} ${command.messages}")
            }
        }.onFailure { Log.e(TAG, "Falha ao ligar os avisos do gatilho", it) }
    }

    /** Leitor caiu: o "solto" nunca vai chegar, então soltar aqui. */
    fun onReaderDisconnected() = update(false)

    private fun update(pressed: Boolean) {
        if (isPressed == pressed) return
        isPressed = pressed
        onTriggerChanged(pressed)
    }

    private companion object {
        const val TAG = "RfidReaderTrigger"
    }
}
