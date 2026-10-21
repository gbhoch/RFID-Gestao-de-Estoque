package com.megagoglio.rfidgestao.rfidreader

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.uk.tsl.rfid.asciiprotocol.AsciiCommander
import com.uk.tsl.rfid.asciiprotocol.device.ConnectionState
import com.uk.tsl.rfid.asciiprotocol.device.ReaderManager
import com.uk.tsl.rfid.asciiprotocol.responders.LoggerResponder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * Plugin Capacitor que expõe o leitor TSL (Bluetooth Classic) ao sistema web.
 *
 * Contrato TypeScript em frontend/src/app/core/rfid/rfid-reader.plugin.ts.
 *
 * Eventos:
 * - `tagsRead`          { tags: [{ epc, rssi?, count }] } — lote deduplicado por EPC a cada
 *                       intervalo ([setBatchInterval], padrão 200 ms);
 * - `tagRead`           { epc, rssi? } — uma vez por leitura física (sem deduplicar).
 *                       Mantido por compatibilidade; só é emitido se houver listener;
 * - `triggerChanged`    { pressed } — gatilho físico apertado/solto;
 * - `connectionChanged` mesmo formato de [getStatus].
 */
@CapacitorPlugin(
    name = "RfidReader",
    permissions = [
        Permission(
            alias = "bluetooth",
            strings = [Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN],
        ),
    ],
)
class RfidReaderPlugin : Plugin() {

    private lateinit var connection: ReaderConnectionManager
    private lateinit var inventory: InventoryController
    private lateinit var trigger: TriggerMonitor
    private lateinit var batcher: TagBatcher

    private val batchScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Os métodos do plugin rodam numa thread própria da bridge; o SDK da TSL foi escrito
     * para ser usado da thread principal (é de onde o app de referência o chama).
     */
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun load() {
        TslSdk.init(context.applicationContext)
        val commander = AsciiCommander.sharedInstance()

        connection = ReaderConnectionManager { state -> onReaderStateChanged(state) }
        batcher = TagBatcher(batchScope) { batch -> notifyListeners("tagsRead", batchJson(batch)) }
        inventory = InventoryController(
            commander = commander,
            onTagRead = { tag ->
                batcher.add(tag)
                // Um evento por leitura física é caro na bridge: só para quem ainda ouve.
                if (hasListeners("tagRead")) {
                    notifyListeners("tagRead", JSObject().apply {
                        put("epc", tag.epc)
                        tag.rssi?.let { put("rssi", it) }
                    })
                }
            },
            onScanningChanged = { notifyListeners("connectionChanged", statusJson()) },
        )
        trigger = TriggerMonitor(commander) { pressed ->
            notifyListeners("triggerChanged", JSObject().put("pressed", pressed))
        }
        connection.registerObservers()
        trigger.attach()
        inventory.attach()
    }

    // ------------------------------------------------------------ ciclo de vida

    override fun handleOnResume() {
        connection.onResume(canUseBluetooth = hasBluetoothPermission())
    }

    override fun handleOnPause() {
        connection.onPause()
    }

    override fun handleOnDestroy() {
        inventory.detach()
        trigger.detach()
        connection.unregisterObservers()
        batchScope.cancel()
    }

    // ---------------------------------------------------------------- métodos

    @PluginMethod
    fun listPairedDevices(call: PluginCall) {
        if (!ensureBluetoothPermission(call)) return
        onMain(call) {
            val current = connection.currentReader
            val devices = JSArray()
            connection.pairedReaders().forEach { reader ->
                devices.put(JSObject().apply {
                    put("address", ReaderConnectionManager.addressOf(reader))
                    put("name", reader.displayName)
                    put("serialNumber", reader.serialNumber)
                    put("info", reader.displayInfoLine)
                    put("connected", reader === current && reader.isConnected)
                })
            }
            call.resolve(JSObject().put("devices", devices))
        }
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val address = call.getString("address")
        if (address.isNullOrBlank()) {
            call.reject("Informe o endereço do leitor.", "INVALID_ARGUMENT")
            return
        }
        if (!ensureBluetoothPermission(call)) return
        onMain(call) {
            val reader = connection.findReader(address)
            if (reader == null) {
                call.reject("Leitor $address não está pareado com este aparelho.", "NOT_FOUND")
                return@onMain
            }
            // A conexão é assíncrona: o resultado chega pelo evento connectionChanged.
            connection.useReader(reader)
            call.resolve(statusJson())
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        onMain(call) {
            if (inventory.isScanning) inventory.scanStop()
            connection.disconnect()
            call.resolve(statusJson())
        }
    }

    @PluginMethod
    fun startInventory(call: PluginCall) {
        onMain(call) {
            if (!connection.state.isConnected) {
                call.reject("Leitor desconectado.", "NOT_CONNECTED")
                return@onMain
            }
            inventory.scanStart()
            call.resolve()
        }
    }

    @PluginMethod
    fun stopInventory(call: PluginCall) {
        onMain(call) {
            inventory.scanStop()
            call.resolve()
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(statusJson())
    }

    /**
     * Filtro inclusivo por prefixos de EPC: { prefixes: string[] }. Substitui o filtro
     * anterior. Quem guarda a lista é o lado web; aqui só se aplica o que chegou.
     */
    @PluginMethod
    fun applyEpcFilter(call: PluginCall) {
        val raw = call.getArray("prefixes")
        if (raw == null) {
            call.reject("Informe prefixes: string[].", "INVALID_ARGUMENT")
            return
        }
        val filter = try {
            EpcPrefixFilter.of(raw.toList<Any?>().map { it?.toString().orEmpty() })
        } catch (e: Exception) {
            // IllegalArgumentException do of() ou JSONException de item que não é string.
            call.reject(e.message ?: "Prefixos inválidos.", "INVALID_ARGUMENT")
            return
        }
        onMain(call) {
            if (!connection.state.isConnected) {
                call.reject("Leitor desconectado.", "NOT_CONNECTED")
                return@onMain
            }
            inventory.applyEpcFilter(filter)
            notifyListeners("connectionChanged", statusJson())
            call.resolve(filterJson(filter))
        }
    }

    @PluginMethod
    fun clearEpcFilter(call: PluginCall) {
        onMain(call) {
            inventory.clearEpcFilter()
            notifyListeners("connectionChanged", statusJson())
            call.resolve()
        }
    }

    /** Intervalo do evento tagsRead: { intervalMs } entre 50 e 5000. */
    @PluginMethod
    fun setBatchInterval(call: PluginCall) {
        val intervalMs = call.getInt("intervalMs")
        if (intervalMs == null) {
            call.reject("Informe intervalMs.", "INVALID_ARGUMENT")
            return
        }
        try {
            batcher.intervalMs = intervalMs.toLong()
        } catch (e: IllegalArgumentException) {
            call.reject(e.message, "INVALID_ARGUMENT")
            return
        }
        call.resolve(JSObject().put("intervalMs", batcher.intervalMs))
    }

    /**
     * Identificação do aparelho enviada como `deviceId` nas leituras: o ANDROID_ID, como no
     * SyncRepository do app de referência. Desde o Android 8 o valor depende também da
     * chave de assinatura do app, então os dois apps no mesmo aparelho podem divergir.
     */
    @PluginMethod
    @Suppress("HardwareIds")
    fun getDeviceId(call: PluginCall) {
        val id = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        call.resolve(JSObject().put("deviceId", id ?: "desconhecido"))
    }

    // ------------------------------------------------------------- permissões

    /**
     * Até a API 30 as permissões de Bluetooth são de instalação; BLUETOOTH_CONNECT/SCAN
     * nem existem lá, então não há o que pedir.
     */
    private fun hasBluetoothPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            getPermissionState("bluetooth") == PermissionState.GRANTED

    /** true = pode seguir; false = pediu a permissão e o método é retomado no callback. */
    private fun ensureBluetoothPermission(call: PluginCall): Boolean {
        if (hasBluetoothPermission()) return true
        requestPermissionForAlias("bluetooth", call, "onBluetoothPermissionResult")
        return false
    }

    @PermissionCallback
    private fun onBluetoothPermissionResult(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            call.reject("Permissão de Bluetooth negada.", "PERMISSION_DENIED")
            return
        }
        mainHandler.post { connection.onBluetoothPermissionsGranted() }
        when (call.methodName) {
            "listPairedDevices" -> listPairedDevices(call)
            "connect" -> connect(call)
            else -> call.resolve()
        }
    }

    // ----------------------------------------------------------------- estado

    private fun onReaderStateChanged(state: ReaderState) {
        when (state.connectionState) {
            // A configuração não sobrevive a uma reconexão: reenviar sempre que conectar.
            // O filtro EPC vai junto: os campos de Select moram no InventoryCommand.
            ConnectionState.CONNECTED -> {
                inventory.applyConfiguration()
                trigger.enableReporting()
            }
            ConnectionState.DISCONNECTED, ConnectionState.LOST -> {
                inventory.onReaderDisconnected()
                trigger.onReaderDisconnected()
                batcher.flush()
            }
            else -> Unit
        }
        notifyListeners("connectionChanged", statusJson())
    }

    private fun batchJson(batch: List<TagBatchEntry>): JSObject {
        val tags = JSArray()
        batch.forEach { tag ->
            tags.put(JSObject().apply {
                put("epc", tag.epc)
                tag.rssi?.let { put("rssi", it) }
                put("count", tag.count)
            })
        }
        return JSObject().put("tags", tags)
    }

    private fun filterJson(filter: EpcPrefixFilter?): JSObject = JSObject().apply {
        put("prefixes", JSArray(filter?.prefixes.orEmpty()))
        // Trecho aplicado no leitor (Gen2 Select); o restante é conferido no app.
        filter?.hardwareSpec?.let { put("hardwarePrefix", it.valueHex) }
    }

    private fun statusJson(): JSObject {
        val state = connection.state
        return JSObject().apply {
            put("state", state.connectionState.name.lowercase())
            put("connected", state.isConnected)
            put("scanning", inventory.isScanning)
            put("triggerPressed", trigger.isPressed)
            put("epcFilter", filterJson(inventory.activeFilter))
            put("batchIntervalMs", batcher.intervalMs)
            put("bluetoothPermission", hasBluetoothPermission())
            state.readerName?.let { put("readerName", it) }
            state.serialNumber?.let { put("serialNumber", it) }
            state.address?.let { put("address", it) }
            state.reason?.let { put("reason", it) }
        }
    }

    private inline fun onMain(call: PluginCall, crossinline block: () -> Unit) {
        mainHandler.post {
            try {
                block()
            } catch (e: SecurityException) {
                call.reject("Permissão de Bluetooth ausente.", "PERMISSION_DENIED", e)
            } catch (e: Exception) {
                call.reject(e.message ?: "Erro no leitor.", "READER_ERROR", e)
            }
        }
    }
}

/**
 * Inicialização única do SDK da TSL no processo — equivale ao RfidApp.onCreate do app de
 * referência. Fica fora do plugin porque o plugin é recriado junto com a Activity, e o
 * AsciiCommander/ReaderManager são singletons de processo.
 */
private object TslSdk {
    @Volatile
    private var initialized = false

    @Synchronized
    fun init(context: Context) {
        if (initialized) return
        initialized = true

        AsciiCommander.createSharedInstance(context)
        val commander = AsciiCommander.sharedInstance()
        commander.clearResponders()

        // O LoggerResponder tem de ser o PRIMEIRO da cadeia: ele ecoa cada linha recebida
        // do leitor para o Logcat e repassa adiante (`adb logcat`).
        commander.addResponder(LoggerResponder())

        // Habilita os comandos síncronos (*.synchronousCommand()).
        commander.addSynchronousResponder()

        // BLE desligado (padrão): o 1128 é Bluetooth Classic.
        ReaderManager.create(context)
    }
}
