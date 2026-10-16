package com.megagoglio.rfidgestao.rfidreader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Conversão de [EpcFilterSpec] para os parâmetros de Select (portada do EpcFilterTest do
 * app de referência) e regras do [EpcPrefixFilter].
 */
class EpcFilterTest {

    @Test
    fun `offsetBits soma o offset base de 32 bits do banco EPC ao inicio em nibbles`() {
        val spec = EpcFilterSpec(startChar = 0, lengthChar = 4, valueHex = "ABCD")
        assertEquals(32, EpcFilterSelectParams.offsetBits(spec))
    }

    @Test
    fun `lengthBits converte caracteres hex para bits (4 bits por nibble)`() {
        val spec = EpcFilterSpec(startChar = 0, lengthChar = 6, valueHex = "ABCDEF")
        assertEquals(24, EpcFilterSelectParams.lengthBits(spec))
    }

    @Test
    fun `selectData faz padding com zero a direita quando o hex tem comprimento impar`() {
        assertEquals("ABCD", EpcFilterSelectParams.selectData(EpcFilterSpec(0, 4, "ABCD")))
        assertEquals("ABC0", EpcFilterSelectParams.selectData(EpcFilterSpec(0, 3, "ABC")))
    }

    @Test
    fun `um prefixo vira Select inteiro no leitor`() {
        val filter = EpcPrefixFilter.of(listOf(" 2025 "))
        assertEquals(listOf("2025"), filter.prefixes)
        assertEquals(EpcFilterSpec(0, 4, "2025"), filter.hardwareSpec)
    }

    @Test
    fun `varios prefixos aplicam no leitor so o trecho comum`() {
        val filter = EpcPrefixFilter.of(listOf("30340A", "3034b1"))
        assertEquals(EpcFilterSpec(0, 4, "3034"), filter.hardwareSpec)
        assertTrue(filter.matches("30340A0000000001"))
        assertTrue(filter.matches("3034B10000000001"))
        assertFalse(filter.matches("3034C20000000001"))
    }

    @Test
    fun `prefixos sem trecho comum ficam so no app`() {
        val filter = EpcPrefixFilter.of(listOf("30", "E2"))
        assertNull(filter.hardwareSpec)
        assertTrue(filter.matches("E28011700000020F4A8C1234"))
        assertFalse(filter.matches("000000000000000000008285"))
    }

    @Test
    fun `prefixo coberto por outro mais curto e descartado`() {
        val filter = EpcPrefixFilter.of(listOf("3034", "30", "30"))
        assertEquals(listOf("30"), filter.prefixes)
    }

    @Test
    fun `rejeita lista vazia, nao hex e longo demais`() {
        assertThrows(IllegalArgumentException::class.java) { EpcPrefixFilter.of(listOf(" ")) }
        assertThrows(IllegalArgumentException::class.java) { EpcPrefixFilter.of(listOf("30G")) }
        assertThrows(IllegalArgumentException::class.java) {
            EpcPrefixFilter.of(listOf("A".repeat(EpcPrefixFilter.MAX_PREFIX_CHARS + 1)))
        }
    }
}
