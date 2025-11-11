#!/bin/bash

# Script para probar la exportación a Spring Boot

ENDPOINT="http://localhost:3000/proyecto/export/springboot"
OUTPUT_FILE="proyecto-exportado.zip"

echo "🚀 Probando exportación a Spring Boot..."
echo ""

# Leer el archivo JSON de ejemplo
if [ ! -f "test-export-example.json" ]; then
    echo "❌ Error: No se encuentra test-export-example.json"
    exit 1
fi

echo "📤 Enviando solicitud al servidor..."
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d @test-export-example.json \
  --output "$OUTPUT_FILE" \
  --progress-bar

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Exportación completada!"
    echo "📦 Archivo generado: $OUTPUT_FILE"
    echo ""
    echo "Para descomprimir y ver el proyecto:"
    echo "  unzip $OUTPUT_FILE -d proyecto-exportado"
    echo ""
    echo "Para ejecutar el proyecto:"
    echo "  cd proyecto-exportado/ecommerce"
    echo "  docker-compose up --build"
else
    echo ""
    echo "❌ Error al exportar el proyecto"
    exit 1
fi
