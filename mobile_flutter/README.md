# Glucosoft App — Proyecto Móvil Real (Flutter para Android e iOS)

**Glucosoft App** es una aplicación móvil local-first para el seguimiento personal de glucosa. Funciona 100% sin internet, sin cuentas ni servidores externos, con base de datos local SQLite (`sqflite`), soporte hasta 3 perfiles independientes, reportes PDF en el dispositivo, contacto de emergencia y conexión Bluetooth Low Energy para equipos compatibles.

---

## 1. Tecnología elegida y justificación

- **Framework:** **Flutter (Dart)** frente a React Native, porque compila directamente a código nativo ARM para Android e iOS desde una sola base de código, ofrece escalado de texto accesible (`MediaQuery.textScaler`) ideal para adultos mayores y cuenta con ecosistema maduro para SQLite (`sqflite`), Bluetooth (`flutter_blue_plus`) y generación de PDF offline (`pdf` + `printing`).
- **Base de datos local:** **SQLite (`sqflite`)** en el almacenamiento privado del teléfono (`glucosoft_local.db`, versión de esquema 2 con migración automática `onUpgrade` sin pérdida de datos y `PRAGMA foreign_keys = ON`).

---

## 2. Estado real de compatibilidad Bluetooth de los 5 modelos

Ninguna lectura Bluetooth se simula ni se inventa. Todos los modelos permiten registro manual inmediato y están preparados para diagnóstico físico:

| Modelo | Estado técnico en la app | Qué necesita validación física |
| :--- | :--- | :--- |
| **OKMeter Match II** | Identificado en catálogo; versión base sin Bluetooth integrado | Verificar si tu unidad física corresponde a una variante Bluetooth y si expone servicio `0x1808` o propietario |
| **GlucoLeader Enhance** | Prefijos y perfil estándar `0x1808` preparados | Validar con equipo físico si transmite por `0x2A18` o protocolo serial propietario |
| **Glucocare D** | Prefijos y lectura estándar preparados | Verificar según lote si posee Bluetooth activo y si admite lectura de memoria (`0x2A52`) |
| **Glucomax** | Configurado en catálogo y registro manual | Confirmar con equipo físico si tiene módulo Bluetooth activo |
| **Glucocare Match (GLM-76L)** | Candidato Bluetooth con perfil estándar `0x1808` | Probar en físico emparejamiento, notificación de lectura y descarga de memoria |

---

## 3. Requisitos para compilar el APK instalable (Android)

> Nota transparente: Este entorno de Google AI Studio no incluye Android SDK, JDK ni Flutter SDK instalados, por lo que no puede generar el binario `.apk` directamente aquí. El proyecto móvil en `mobile_flutter/` está listo para compilarse con los comandos exactos de abajo.

### Requisitos previos en tu computador (Windows, macOS o Linux)
1. **Flutter SDK** (`>= 3.3.0`)
2. **Android Studio** o **Android SDK (API 34)** + **Java JDK 17**

### Comandos exactos para generar el APK instalable

```bash
cd mobile_flutter
flutter pub get
flutter test
flutter build apk --release
```

Al finalizar, el archivo instalable se generará en:

```text
mobile_flutter/build/app/outputs/flutter-apk/app-release.apk
```

---

## 4. Cómo transferir e instalar el APK en tu teléfono Android

1. **Transferir el archivo:** Envía `app-release.apk` a tu teléfono por cable USB (carpeta *Descargas*), Google Drive o correo personal.
2. **Abrir el archivo:** Desde la app **Archivos** (o *Mis archivos*) de tu Android, toca `app-release.apk`.
3. **Permitir instalación desde esa fuente:** Si Android muestra *"Por tu seguridad, tu teléfono no tiene permitido instalar apps desconocidas de esta fuente"*:
   - Toca **Configuración** en el aviso.
   - Activa el interruptor **Permitir desde esta fuente**.
   - Regresa atrás y pulsa **Instalar**.
4. **Permisos al abrir:** Cuando uses la pestaña **Medidor**, Android te pedirá permiso para buscar dispositivos cercanos (Bluetooth); acéptalo para escanear equipos físicos.

---

## 5. Preparación y pasos para iOS (Xcode / Apple)

El proyecto ya incluye `ios/Runner/Info.plist` (con `CFBundleDisplayName = Glucosoft App`, `NSBluetoothAlwaysUsageDescription` y `LSApplicationQueriesSchemes: tel`) y `ios/Podfile` (`platform :ios, '13.0'`).

Para compilar y firmar en macOS con Xcode:

```bash
cd mobile_flutter
flutter pub get
cd ios && pod install && cd ..
open ios/Runner.xcworkspace
```

En Xcode:
1. Selecciona el target **Runner** -> **Signing & Capabilities**.
2. Elige tu **Team** de Apple Developer y ajusta el **Bundle Identifier** (`com.glucosoft.app` o uno único de tu cuenta).
3. Conecta un iPhone físico (Bluetooth BLE no funciona en el simulador de iOS) y ejecuta `flutter run --release` o **Product -> Archive** en Xcode para generar y firmar el `.ipa`.
