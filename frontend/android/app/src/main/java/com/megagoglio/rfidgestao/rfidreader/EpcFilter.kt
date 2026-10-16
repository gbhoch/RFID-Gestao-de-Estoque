package com.megagoglio.rfidgestao.rfidreader

/**
 * Um filtro de EPC: casa [lengthChar] caracteres hex do EPC a partir da posição
 * [startChar] (ambos contados em caracteres hex — 1 caractere = 1 nibble = 4 bits)
 * contra [valueHex].
 *
 * Copiado de RFID_Reader-Android_App/.../reader/EpcFilter.kt, onde foi validado em
 * hardware (TSL 1128, 22/09/2026). Aqui ele é sempre um prefixo (startChar = 0), ver
 * [EpcPrefixFilter].
 */
data class EpcFilterSpec(
    val startChar: Int,
    val lengthChar: Int,
    val valueHex: String,
)

/**
 * Converte um [EpcFilterSpec] (em caracteres hex) para os parâmetros de Select do SDK da
 * TSL, que são sempre em BITS — confirmado literalmente no Javadoc de
 * `ISelectMaskParameters`:
 * `setSelectLength`: "Sets the length in bits of the select mask"
 * `setSelectOffset`: "Sets the number of bits from the start of the block to the
 * start of the select mask"
 */
object EpcFilterSelectParams {

    /**
     * `setSelectOffset` conta os bits a partir do início ABSOLUTO do banco EPC, que no
     * Gen2 reserva 16 bits de CRC + 16 bits de PC antes do EPC em si. Por isso o EPC
     * visível começa no bit 32 do banco.
     *
     * CONFIRMADO em hardware (TSL 1128, 22/09/2026): com duas tags em campo,
     * `2025030419038A011A40004B` e `000000000000000000008285`, um filtro
     * start=0/length=1/valor "2" (que vira `-so0020`, ou seja 32 bits) reportou apenas a
     * primeira — isto é, casou o PRIMEIRO caractere do EPC. Se a base fosse 0, o mesmo
     * offset teria caído no caractere 8 e a tag casada seria a outra.
     */
    private const val EPC_BASE_OFFSET_BITS = 32

    fun offsetBits(spec: EpcFilterSpec): Int = EPC_BASE_OFFSET_BITS + spec.startChar * 4

    fun lengthBits(spec: EpcFilterSpec): Int = spec.lengthChar * 4

    /**
     * `setSelectData` espera uma string hex "padded to ensure full bytes" (2 caracteres
     * por byte), então um [lengthChar] ímpar é completado com um '0' à direita.
     *
     * CONFIRMADO em hardware (TSL 1128, 22/09/2026): o filtro de 1 nibble valor "2" foi
     * enviado como `-sl04 -sd20` (4 bits de comprimento, dado preenchido para um byte) e
     * casou corretamente só a tag cujo primeiro caractere é '2'. O leitor respeita o
     * comprimento em bits e ignora os bits de padding.
     */
    fun selectData(spec: EpcFilterSpec): String =
        if (spec.valueHex.length % 2 == 0) spec.valueHex else spec.valueHex + "0"
}

/**
 * Filtro inclusivo (whitelist) por prefixos de EPC: só são reportadas as tags cujo EPC
 * começa com algum dos [prefixes].
 *
 * Um Select do Gen2 carrega UMA máscara, e o [com.uk.tsl.rfid.asciiprotocol.commands.InventoryCommand]
 * só embute um Select por rodada. Por isso o filtro tem duas camadas:
 *
 * - no LEITOR (Gen2 Select), o [hardwareSpec]: o maior prefixo comum a todos os
 *   prefixos. Com um único prefixo é ele mesmo, e o filtro é 100% no ar, exatamente como
 *   no app de referência. Com vários, o leitor já descarta quem não compartilha o
 *   trecho comum;
 * - no APP, [matches]: o teste exato contra a lista, que cobre o que o Select comum
 *   deixou passar. Sem prefixo comum (ex.: "30" e "E2"), o filtro é só no app.
 *
 * Encadear vários `.ts` (TransponderSelectCommand) com ações 000 + 001 faria a união no
 * ar, mas as flags SL ficariam de uma execução só: as rodadas do gatilho físico e as tags
 * que entram no campo depois não passariam por esses Selects.
 */
class EpcPrefixFilter private constructor(val prefixes: List<String>) {

    /** Select a aplicar no leitor, ou null quando os prefixos não têm trecho comum. */
    val hardwareSpec: EpcFilterSpec? =
        commonPrefix(prefixes).takeIf { it.isNotEmpty() }?.let {
            EpcFilterSpec(startChar = 0, lengthChar = it.length, valueHex = it)
        }

    fun matches(epc: String): Boolean = prefixes.any { epc.startsWith(it, ignoreCase = true) }

    companion object {
        /**
         * Limite da máscara: `-sl` vai em 2 dígitos hex (até 255 bits), ou seja 63 nibbles.
         * Um EPC de 96 bits tem 24.
         */
        const val MAX_PREFIX_CHARS = 63

        private val HEX = Regex("^[0-9A-F]+$")

        /**
         * Normaliza e valida a lista vinda do JavaScript: maiúsculas, sem espaços, sem
         * repetidos e sem prefixos já cobertos por outro mais curto ("30" cobre "3034").
         *
         * @throws IllegalArgumentException com a mensagem a devolver ao JavaScript.
         */
        fun of(raw: List<String>): EpcPrefixFilter {
            val normalized = raw.map { it.trim().uppercase() }.filter { it.isNotEmpty() }
            require(normalized.isNotEmpty()) { "Informe ao menos um prefixo de EPC." }
            normalized.forEach { p ->
                require(HEX.matches(p)) { "Prefixo \"$p\" não é hexadecimal." }
                require(p.length <= MAX_PREFIX_CHARS) {
                    "Prefixo \"$p\" passa de $MAX_PREFIX_CHARS caracteres."
                }
            }
            val distinct = normalized.distinct().sortedBy { it.length }
            val minimal = mutableListOf<String>()
            distinct.forEach { p -> if (minimal.none { p.startsWith(it) }) minimal += p }
            return EpcPrefixFilter(minimal)
        }

        fun commonPrefix(values: List<String>): String {
            if (values.isEmpty()) return ""
            return values.reduce { acc, s -> acc.commonPrefixWith(s) }
        }
    }
}
