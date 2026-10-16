package com.megagoglio.rfidgestao

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.megagoglio.rfidgestao.rfidreader.RfidReaderPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Plugins locais (do próprio app, fora do node_modules) precisam ser registrados
        // ANTES do super.onCreate, que é onde a bridge é criada.
        registerPlugin(RfidReaderPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
