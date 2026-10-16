package com.megagoglio.rfidgestao.rfidreader

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Uma tag dentro de um lote: [count] leituras físicas, [rssi] a mais forte delas. */
data class TagBatchEntry(val epc: String, val rssi: Int?, val count: Int)

/**
 * Agrupa as leituras físicas em lotes deduplicados por EPC e entrega um lote a [onBatch]
 * a cada [intervalMs].
 *
 * Um scan contínuo gera centenas de leituras por segundo da mesma meia dúzia de tags;
 * mandar cada uma pela bridge do Capacitor custa uma serialização JSON + um evento no
 * WebView por leitura. O timer só existe enquanto há leitura pendente: com o leitor
 * parado não roda nada.
 */
class TagBatcher(
    private val scope: CoroutineScope,
    private val onBatch: (List<TagBatchEntry>) -> Unit,
) {

    @Volatile
    var intervalMs: Long = DEFAULT_INTERVAL_MS
        set(value) {
            require(value in MIN_INTERVAL_MS..MAX_INTERVAL_MS) {
                "Intervalo deve ficar entre $MIN_INTERVAL_MS e $MAX_INTERVAL_MS ms."
            }
            field = value
        }

    private val lock = Any()
    private var pending = LinkedHashMap<String, TagBatchEntry>()
    private var flushScheduled = false

    fun add(read: TagRead) {
        synchronized(lock) {
            val prev = pending[read.epc]
            pending[read.epc] = if (prev == null) {
                TagBatchEntry(read.epc, read.rssi, 1)
            } else {
                TagBatchEntry(read.epc, maxRssi(prev.rssi, read.rssi), prev.count + 1)
            }
            if (!flushScheduled) {
                flushScheduled = true
                scope.launch {
                    delay(intervalMs)
                    flush()
                }
            }
        }
    }

    /** Entrega já o que estiver pendente (ex.: ao desconectar). */
    fun flush() {
        val batch = synchronized(lock) {
            flushScheduled = false
            if (pending.isEmpty()) return
            val values = pending.values.toList()
            pending = LinkedHashMap()
            values
        }
        onBatch(batch)
    }

    private fun maxRssi(a: Int?, b: Int?): Int? = when {
        a == null -> b
        b == null -> a
        else -> maxOf(a, b)
    }

    companion object {
        const val DEFAULT_INTERVAL_MS = 200L
        const val MIN_INTERVAL_MS = 50L
        const val MAX_INTERVAL_MS = 5000L
    }
}
