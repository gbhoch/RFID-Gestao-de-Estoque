package com.megagoglio.rfidgestao.rfidreader

import android.util.Log
import com.uk.tsl.rfid.asciiprotocol.AsciiCommander
import com.uk.tsl.rfid.asciiprotocol.device.ConnectionState
import com.uk.tsl.rfid.asciiprotocol.device.Reader
import com.uk.tsl.rfid.asciiprotocol.device.ReaderManager
import com.uk.tsl.rfid.asciiprotocol.device.TransportType
import com.uk.tsl.utils.Observable

/** Estado da conexão com o leitor, no formato que o plugin repassa ao JavaScript. */
data class ReaderState(
    val connectionState: ConnectionState = ConnectionState.DISCONNECTED,
    val readerName: String? = null,
    val serialNumber: String? = null,
    val address: String? = null,
    val reason: String? = null,
) {
    val isConnected: Boolean get() = connectionState == ConnectionState.CONNECTED
}

/**
 * Ciclo de vida da conexão com o leitor TSL.
 *
 * Adaptado de RFID_Reader-Android_App/.../reader/ReaderConnectionManager.kt. Diferenças:
 * - o estado sai por callback ([onStateChanged]) em vez de StateFlow, porque quem
 *   consome é o plugin Capacitor e não uma tela Compose;
 * - a escolha do leitor vem do JavaScript, pelo endereço Bluetooth (ver [addressOf]),
 *   em vez do índice devolvido pela DeviceListActivity — por isso não há
 *   `isSelectingReader` aqui.
 */
class ReaderConnectionManager(private val onStateChanged: (ReaderState) -> Unit) {

    private val commander: AsciiCommander get() = AsciiCommander.sharedInstance()
    private val readerManager: ReaderManager get() = ReaderManager.sharedInstance()

    var state: ReaderState = ReaderState()
        private set

    /** O leitor em uso. Null quando nenhum foi escolhido ou o escolhido sumiu da lista. */
    var currentReader: Reader? = null
        private set

    private var observersRegistered = false

    // ---------------------------------------------------------------- eventos

    private val stateChangedObserver = Observable.Observer<String> { _, reason ->
        onConnectionStateChanged(reason)
    }

    private val readerAddedObserver = Observable.Observer<Reader> { _, _ ->
        reconnectIfPossible()
    }

    private val readerUpdatedObserver = Observable.Observer<Reader> { _, _ ->
        publishState(state.reason)
    }

    private val readerRemovedObserver = Observable.Observer<Reader> { _, reader ->
        // O leitor em uso saiu da lista (desligado, desemparelhado): parar de usá-lo.
        if (reader == currentReader) {
            currentReader = null
            commander.reader = null
            publishState(reason = null)
        }
    }

    fun registerObservers() {
        if (observersRegistered) return
        observersRegistered = true

        commander.stateChangedEvent().addObserver(stateChangedObserver)

        val readerList = readerManager.readerList
        readerList.readerAddedEvent().addObserver(readerAddedObserver)
        readerList.readerUpdatedEvent().addObserver(readerUpdatedObserver)
        readerList.readerRemovedEvent().addObserver(readerRemovedObserver)
    }

    fun unregisterObservers() {
        if (!observersRegistered) return
        observersRegistered = false

        commander.stateChangedEvent().removeObserver(stateChangedObserver)

        val readerList = readerManager.readerList
        readerList.readerAddedEvent().removeObserver(readerAddedObserver)
        readerList.readerUpdatedEvent().removeObserver(readerUpdatedObserver)
        readerList.readerRemovedEvent().removeObserver(readerRemovedObserver)
    }

    // ------------------------------------------------------------ ciclo de vida

    /**
     * @param canUseBluetooth false enquanto as permissões de Bluetooth não foram concedidas.
     *
     * O [ReaderManager] exige que onResume e onPause venham sempre aos pares, então
     * onResume é chamado incondicionalmente. Só a varredura da lista fica condicionada à
     * permissão — em API 31+ ela lança SecurityException sem BLUETOOTH_CONNECT.
     */
    fun onResume(canUseBluetooth: Boolean) {
        readerManager.onResume()
        if (canUseBluetooth) {
            readerManager.updateList()
            reconnectIfPossible()
        }
    }

    /** Permissões concedidas com a Activity já ativa: só a parte que ficou de fora do [onResume]. */
    fun onBluetoothPermissionsGranted() {
        readerManager.updateList()
        reconnectIfPossible()
    }

    fun onPause() {
        // Soltar o leitor para que outros apps possam usá-lo. Ao voltar, o onResume
        // reconecta ao mesmo leitor (currentReader é mantido).
        currentReader?.disconnect()
        readerManager.onPause()
    }

    // ---------------------------------------------------------------- leitores

    /**
     * Leitores TSL que o [ReaderManager] conhece — em Bluetooth Classic, os já pareados
     * nas configurações do Android.
     */
    fun pairedReaders(): List<Reader> {
        readerManager.updateList()
        return readerManager.readerList.list().toList()
    }

    fun findReader(address: String): Reader? =
        pairedReaders().firstOrNull { addressOf(it).equals(address, ignoreCase = true) }

    // ---------------------------------------------------------------- conexão

    /** Reconecta ao leitor já escolhido, se houver e se ele estiver ocioso. */
    private fun reconnectIfPossible() {
        val reader = currentReader ?: return
        if (reader.isConnecting) return

        val transport = reader.activeTransport
        val idle = transport == null ||
            transport.connectionStatus().value() == ConnectionState.DISCONNECTED
        if (!idle) return

        val started = if (reader.allowMultipleTransports() || reader.lastTransportType == null) {
            reader.connect()
        } else {
            // Leitores que aceitam um único transporte ativo devem reconectar pelo último usado.
            reader.connect(reader.lastTransportType)
        }
        Log.d(TAG, "reconnectIfPossible: ${reader.displayName} -> $started")
    }

    /** Passa a usar [reader] (equivale ao useReaderAt do app de referência). */
    fun useReader(reader: Reader) {
        if (currentReader != null && currentReader !== reader) {
            currentReader?.disconnect()
        }

        currentReader = reader
        commander.reader = reader

        if (!reader.isConnected && !reader.isConnecting) {
            reader.connect(TransportType.BLUETOOTH)
        }
        publishState(reason = null)
    }

    fun disconnect() {
        currentReader?.disconnect()
        currentReader = null
        commander.reader = null
        publishState(reason = null)
    }

    // ----------------------------------------------------------------- estado

    private fun onConnectionStateChanged(reason: String?) {
        val connectionState = commander.connectionState
        Log.d(TAG, "AsciiCommander: $connectionState (conectado=${commander.isConnected}) $reason")

        if (connectionState == ConnectionState.DISCONNECTED) {
            // Uma desconexão manual já limpou currentReader. Se sobrou um leitor aqui e a
            // última tentativa falhou, ele não serve — forçar nova escolha pelo usuário.
            currentReader?.let { reader ->
                if (!reader.wasLastConnectSuccessful()) {
                    currentReader = null
                }
            }
        }
        publishState(reason)
    }

    private fun publishState(reason: String?) {
        val reader = currentReader
        state = ReaderState(
            connectionState = commander.connectionState ?: ConnectionState.DISCONNECTED,
            readerName = reader?.displayName,
            serialNumber = reader?.serialNumber,
            address = reader?.let(::addressOf),
            reason = reason,
        )
        onStateChanged(state)
    }

    companion object {
        private const val TAG = "RfidReaderConnection"

        /**
         * Endereço MAC do leitor. O [Reader] do SDK não expõe o MAC diretamente, mas o
         * `id()` do transporte Bluetooth Classic devolve `BluetoothDevice.getAddress()`
         * (confirmado com `javap -c` na classe `device.a` do AAR 4.0.1). Sem transporte
         * Bluetooth, cai para o serial/nome — basta ser estável entre list e connect.
         */
        fun addressOf(reader: Reader): String =
            reader.getTransport(TransportType.BLUETOOTH)?.id()?.takeIf { it.isNotBlank() }
                ?: reader.serialNumber?.takeIf { it.isNotBlank() }
                ?: reader.displayName.orEmpty()
    }
}
