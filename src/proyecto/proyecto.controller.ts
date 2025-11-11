import { Controller, Get, Post, Body,  Param, Res, Delete } from '@nestjs/common';
import { ProyectoService } from './proyecto.service';
import { Auth } from 'src/auth/decorators';
import { CreateProyectoDto } from './dto/create-proyecto.dto';
import { SpringBootExportService } from './springboot-export.service';
import { FlutterExportService } from './flutter-export.service';
import { Response } from 'express';
import { Diagram } from 'src/diagram/entities/diagram.entity';
import { UMLDiagram } from './interfaces/uml.interface';
import * as path from 'path';
import * as fs from 'fs';


@Controller('project')
export class ProyectoController {
  constructor(
    private readonly proyectoService: ProyectoService,
    private readonly springBootExportService: SpringBootExportService,
    private readonly flutterExportService: FlutterExportService
  ) {}  
  @Post()
  create(@Body() body:CreateProyectoDto) {
  
     return this.proyectoService.create(body);
  }

  @Get()
  findAll() {
    return this.proyectoService.findAll();
  }

  

  
  @Get('user/:id')
  findOnByUser(@Param('id') id: string) {
    return this.proyectoService.findAllByUser(id);
  }

  @Get('/:id')
  findOnById(@Param('id') id: string) {
    return this.proyectoService.findOneP(id);
  }

  

  @Post('/export/springboot')
  async exportToSpringBoot(
    @Body() body: { diagram: UMLDiagram; projectName: string; basePackage: string },
    @Res() res: Response
  ) {
    try {
      const { diagram, projectName, basePackage } = body;
      
      // Validar datos de entrada
      if (!diagram || !diagram.classes || !diagram.relations) {
        return res.status(400).json({
          success: false,
          message: 'El diagrama debe contener classes y relations'
        });
      }

      if (!projectName || !basePackage) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere projectName y basePackage'
        });
      }

      // Exportar a Spring Boot
      const zipPath = await this.springBootExportService.exportToSpringBoot(
        diagram,
        projectName,
        basePackage
      );

      // Enviar el archivo ZIP
      const fileName = `${projectName}.zip`;
      res.download(zipPath, fileName, (err) => {
        if (err) {
          console.error('Error al enviar el archivo:', err);
          res.status(500).json({
            success: false,
            message: 'Error al descargar el archivo'
          });
        }
        // Opcionalmente, eliminar el archivo después de enviarlo
        // fs.unlinkSync(zipPath);
      });
    } catch (error) {
      console.error('Error al exportar:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al exportar el proyecto'
      });
    }
  }


  @Post('/export/fullstack')
  async exportFullstack(
    @Body() body: { diagram: UMLDiagram; projectName: string; basePackage: string; baseUrl: string },
    @Res() res: Response
  ) {
    try {
      const { diagram, projectName, basePackage, baseUrl } = body;
      
      console.log('📋 [FULLSTACK EXPORT] Iniciando exportación fullstack');
      console.log('📋 [FULLSTACK EXPORT] projectName:', projectName);
      console.log('📋 [FULLSTACK EXPORT] basePackage:', basePackage);
      console.log('📋 [FULLSTACK EXPORT] baseUrl:', baseUrl);
      
      // Validar datos de entrada
      if (!diagram || !diagram.classes || !diagram.relations) {
        console.error('❌ [FULLSTACK EXPORT] Validación falló: diagrama incompleto');
        return res.status(400).json({
          success: false,
          message: 'El diagrama debe contener classes y relations'
        });
      }

      if (!projectName || !basePackage) {
        console.error('❌ [FULLSTACK EXPORT] Validación falló: falta projectName o basePackage');
        return res.status(400).json({
          success: false,
          message: 'Se requiere projectName y basePackage'
        });
      }

      // 1️⃣ Exportar Spring Boot (devuelve ruta del ZIP)
      console.log('🔄 [FULLSTACK EXPORT] Iniciando exportación Spring Boot...');
      const springBootZipPath = await this.springBootExportService.exportToSpringBoot(
        diagram,
        projectName,
        basePackage
      );
      console.log('✅ [FULLSTACK EXPORT] Spring Boot exportado en:', springBootZipPath);

      // Descomprimir el ZIP de Spring Boot para obtener el directorio
      console.log('🔄 [FULLSTACK EXPORT] Descomprimiendo Spring Boot ZIP...');
      const extractDir = path.join(process.cwd(), 'exportar', 'temp_springboot_' + Date.now());
      
      const Extract = require('extract-zip');
      await Extract(springBootZipPath, { dir: extractDir });
      console.log('✅ [FULLSTACK EXPORT] Spring Boot descomprimido en:', extractDir);

      // Buscar el directorio del proyecto dentro del ZIP
      const extractedFiles = await fs.promises.readdir(extractDir);
      console.log('📁 [FULLSTACK EXPORT] Archivos/directorios extraídos:', extractedFiles);
      
      // El directorio del proyecto es el que contiene src, pom.xml, etc.
      // Si está en la raíz, usamos extractDir; si está en un subdirectorio, usamos ese subdirectorio
      let springBootDir = extractDir;
      
      // Verificar si hay un subdirectorio con pom.xml
      const hasPomInRoot = extractedFiles.includes('pom.xml');
      if (!hasPomInRoot) {
        // Buscar el primer directorio que contiene pom.xml
        for (const file of extractedFiles) {
          const filePath = path.join(extractDir, file);
          const stats = await fs.promises.stat(filePath);
          if (stats.isDirectory()) {
            const subFiles = await fs.promises.readdir(filePath);
            if (subFiles.includes('pom.xml')) {
              springBootDir = filePath;
              break;
            }
          }
        }
      }
      
      console.log('📁 [FULLSTACK EXPORT] Directorio Spring Boot extraído:', springBootDir);

      // 2️⃣ Analizar relaciones y detectar transaccionales (reutilizar lógica)
      console.log('🔄 [FULLSTACK EXPORT] Analizando relaciones...');
      const relationMetadata = this.springBootExportService.analyzeRelations(diagram);
    //  const transactionalClasses = this.springBootExportService.detectTransactionalClasses(diagram, relationMetadata);
   //   console.log('✅ [FULLSTACK EXPORT] Relaciones analizadas. Clases transaccionales:', transactionalClasses.size);

      // 3️⃣ Exportar Flutter
      console.log('🔄 [FULLSTACK EXPORT] Iniciando exportación Flutter...');
      const flutterPath = await this.flutterExportService.exportToFlutter(
        diagram,
        projectName,
        baseUrl || 'http://localhost:8080',
        relationMetadata,
        null
      );
      console.log('✅ [FULLSTACK EXPORT] Flutter exportado en:', flutterPath);

      // 4️⃣ Crear ZIP combinado con ambos proyectos
      console.log('🔄 [FULLSTACK EXPORT] Creando ZIP combinado...');
      const archiver = require('archiver');
      const fullstackZipPath = path.join(process.cwd(), 'exportar', 'zips', `${projectName}_fullstack.zip`);
      
      console.log('📁 [FULLSTACK EXPORT] Ruta del ZIP combinado:', fullstackZipPath);
      
      // Crear directorio si no existe
      await fs.promises.mkdir(path.dirname(fullstackZipPath), { recursive: true });
      console.log('✅ [FULLSTACK EXPORT] Directorio creado');
      
      const output = fs.createWriteStream(fullstackZipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log('✅ [FULLSTACK EXPORT] ZIP creado exitosamente. Tamaño:', archive.pointer(), 'bytes');
        // Enviar el archivo ZIP
        res.download(fullstackZipPath, `${projectName}_fullstack.zip`, (err) => {
          if (err) {
            console.error('❌ [FULLSTACK EXPORT] Error al enviar archivo:', err);
          } else {
            console.log('✅ [FULLSTACK EXPORT] Archivo enviado correctamente');
          }
        });
      });

      archive.on('error', (err) => {
        console.error('❌ [FULLSTACK EXPORT] Error en archiver:', err);
        throw err;
      });

      archive.pipe(output);

      // Agregar Spring Boot al ZIP (directorio desempaquetado)
      const sanitizedProjectName = projectName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      
      console.log('📁 [FULLSTACK EXPORT] Directorio Spring Boot a agregar:', springBootDir);
      const springBootExists = await fs.promises.access(springBootDir).then(() => true).catch(() => false);
      console.log('✅ [FULLSTACK EXPORT] ¿Spring Boot existe?:', springBootExists);
      
      if (springBootExists) {
        console.log('📦 [FULLSTACK EXPORT] Agregando Spring Boot al ZIP...');
        archive.directory(springBootDir, 'backend');
        console.log('✅ [FULLSTACK EXPORT] Spring Boot agregado');
      } else {
        console.warn('⚠️  [FULLSTACK EXPORT] ADVERTENCIA: Directorio Spring Boot no encontrado en:', springBootDir);
      }

      // Agregar Flutter al ZIP
      console.log('📁 [FULLSTACK EXPORT] Directorio Flutter:', flutterPath);
      const flutterExists = await fs.promises.access(flutterPath).then(() => true).catch(() => false);
      console.log('✅ [FULLSTACK EXPORT] ¿Flutter existe?:', flutterExists);
      
      if (flutterExists) {
        console.log('📦 [FULLSTACK EXPORT] Agregando Flutter al ZIP...');
        archive.directory(flutterPath, 'frontend');
        console.log('✅ [FULLSTACK EXPORT] Flutter agregado');
      } else {
        console.warn('⚠️  [FULLSTACK EXPORT] ADVERTENCIA: Directorio Flutter no encontrado en:', flutterPath);
      }

      // Generar README principal del proyecto fullstack
      console.log('📝 [FULLSTACK EXPORT] Generando README principal...');
      const mainReadme = this.generateFullstackReadme(projectName, basePackage, baseUrl || 'http://localhost:8080');
      archive.append(mainReadme, { name: 'README.md' });
      console.log('✅ [FULLSTACK EXPORT] README principal agregado');

      console.log('🔄 [FULLSTACK EXPORT] Finalizando archivo ZIP...');
      await archive.finalize();
      console.log('✅ [FULLSTACK EXPORT] Exportación completada exitosamente');

      // Limpiar directorio temporal
      console.log('🧹 [FULLSTACK EXPORT] Limpiando directorio temporal...');
      try {
        await fs.promises.rm(extractDir, { recursive: true, force: true });
        console.log('✅ [FULLSTACK EXPORT] Directorio temporal eliminado');
      } catch (cleanupError) {
        console.warn('⚠️  [FULLSTACK EXPORT] Error al limpiar directorio temporal:', cleanupError);
      }

    } catch (error) {
      console.error('❌ [FULLSTACK EXPORT] Error crítico:', error);
      console.error('❌ [FULLSTACK EXPORT] Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al exportar el proyecto fullstack'
      });
    }
  }

  @Delete('/:id')
  async deleteProject(@Param('id') id: string) {
    return this.proyectoService.delete(id);
  }

  /**
   * Genera el README principal para el proyecto fullstack
   */
  private generateFullstackReadme(projectName: string, basePackage: string, baseUrl: string): string {
    let readme = `# ${projectName} - Proyecto Fullstack\n\n`;
    readme += `🚀 **Aplicación completa generada automáticamente desde diagrama UML**\n\n`;
    
    readme += `## 📁 Estructura del Proyecto\n\n`;
    readme += `\`\`\`\n`;
    readme += `${projectName}_fullstack/\n`;
    readme += `├── backend/          # API REST con Spring Boot\n`;
    readme += `│   ├── src/\n`;
    readme += `│   ├── pom.xml\n`;
    readme += `│   └── README.md    # Documentación de endpoints\n`;
    readme += `├── frontend/         # Aplicación móvil con Flutter\n`;
    readme += `│   ├── lib/\n`;
    readme += `│   ├── pubspec.yaml\n`;
    readme += `│   └── README.md\n`;
    readme += `└── README.md        # Este archivo\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `---\n\n`;
    readme += `## 🔧 Backend (Spring Boot)\n\n`;
    readme += `### Requisitos\n`;
    readme += `- Java 17+\n`;
    readme += `- Maven 3.6+\n`;
    readme += `- MySQL 8.0+\n\n`;
    
    readme += `### Configuración\n\n`;
    readme += `1. Navega al directorio del backend:\n`;
    readme += `\`\`\`bash\n`;
    readme += `cd backend\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `2. Configura la base de datos en \`src/main/resources/application.properties\`:\n`;
    readme += `\`\`\`properties\n`;
    readme += `spring.datasource.url=jdbc:mysql://localhost:3306/tu_base_datos\n`;
    readme += `spring.datasource.username=tu_usuario\n`;
    readme += `spring.datasource.password=tu_contraseña\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `3. Ejecuta el backend:\n`;
    readme += `\`\`\`bash\n`;
    readme += `mvn spring-boot:run\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `El servidor estará disponible en: **${baseUrl}**\n\n`;
    
    readme += `### 📋 Endpoints de la API\n\n`;
    readme += `Consulta el archivo \`backend/README.md\` para ver la **lista completa de endpoints** con ejemplos para Postman.\n\n`;
    
    readme += `**Preview rápido:**\n`;
    readme += `\`\`\`\n`;
    readme += `GET    ${baseUrl}/api/{entidad}       - Listar todos\n`;
    readme += `GET    ${baseUrl}/api/{entidad}/{id}  - Obtener por ID\n`;
    readme += `POST   ${baseUrl}/api/{entidad}       - Crear nuevo\n`;
    readme += `PUT    ${baseUrl}/api/{entidad}/{id}  - Actualizar\n`;
    readme += `DELETE ${baseUrl}/api/{entidad}/{id}  - Eliminar\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `---\n\n`;
    readme += `## 📱 Frontend (Flutter)\n\n`;
    readme += `### Requisitos\n`;
    readme += `- Flutter 3.0+\n`;
    readme += `- Dart 3.0+\n\n`;
    
    readme += `### Configuración\n\n`;
    readme += `1. Navega al directorio del frontend:\n`;
    readme += `\`\`\`bash\n`;
    readme += `cd frontend\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `2. Instala las dependencias:\n`;
    readme += `\`\`\`bash\n`;
    readme += `flutter pub get\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `3. Ejecuta la aplicación:\n`;
    readme += `\`\`\`bash\n`;
    readme += `flutter run\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `**Nota:** Asegúrate de que el backend esté corriendo antes de ejecutar el frontend.\n\n`;
    
    readme += `---\n\n`;
    readme += `## 🧪 Probando la API con Postman\n\n`;
    readme += `### Opción 1: Manualmente\n`;
    readme += `1. Abre Postman\n`;
    readme += `2. Revisa el archivo \`backend/README.md\`\n`;
    readme += `3. Copia los endpoints y crea requests manualmente\n\n`;
    
    readme += `### Opción 2: Importar colección (si está disponible)\n`;
    readme += `1. Importa el archivo \`.postman_collection.json\` si existe\n`;
    readme += `2. Configura las variables de entorno si es necesario\n\n`;
    
    readme += `### Ejemplos básicos de prueba:\n\n`;
    readme += `**1. Crear un registro:**\n`;
    readme += `\`\`\`http\n`;
    readme += `POST ${baseUrl}/api/{entidad}\n`;
    readme += `Content-Type: application/json\n\n`;
    readme += `{\n`;
    readme += `  "campo1": "valor1",\n`;
    readme += `  "campo2": "valor2"\n`;
    readme += `}\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `**2. Obtener todos los registros:**\n`;
    readme += `\`\`\`http\n`;
    readme += `GET ${baseUrl}/api/{entidad}\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `**3. Actualizar un registro:**\n`;
    readme += `\`\`\`http\n`;
    readme += `PUT ${baseUrl}/api/{entidad}/1\n`;
    readme += `Content-Type: application/json\n\n`;
    readme += `{\n`;
    readme += `  "campo1": "nuevo_valor"\n`;
    readme += `}\n`;
    readme += `\`\`\`\n\n`;
    
    readme += `---\n\n`;
    readme += `## 🛠️ Tecnologías Utilizadas\n\n`;
    readme += `### Backend\n`;
    readme += `- ☕ Spring Boot 3.x\n`;
    readme += `- 🗄️ Spring Data JPA\n`;
    readme += `- 🌐 Spring Web (REST API)\n`;
    readme += `- 🐬 MySQL Database\n`;
    readme += `- 📦 Lombok\n`;
    readme += `- 🔄 Maven\n\n`;
    
    readme += `### Frontend\n`;
    readme += `- 📱 Flutter 3.x\n`;
    readme += `- 🎯 Dart 3.x\n`;
    readme += `- 🔌 HTTP Client\n`;
    readme += `- 📊 Provider (State Management)\n\n`;
    
    readme += `---\n\n`;
    readme += `## 📚 Documentación Adicional\n\n`;
    readme += `- **Backend:** Ver \`backend/README.md\` para endpoints detallados\n`;
    readme += `- **Frontend:** Ver \`frontend/README.md\` para estructura de la app\n`;
    readme += `- **Paquete base:** \`${basePackage}.${projectName.toLowerCase()}\`\n\n`;
    
    readme += `---\n\n`;
    readme += `## 🐛 Troubleshooting\n\n`;
    readme += `### Backend no inicia\n`;
    readme += `- Verifica que MySQL esté corriendo\n`;
    readme += `- Revisa las credenciales en \`application.properties\`\n`;
    readme += `- Asegúrate de tener Java 17+\n\n`;
    
    readme += `### Frontend no se conecta al backend\n`;
    readme += `- Verifica que el backend esté corriendo en ${baseUrl}\n`;
    readme += `- Revisa la configuración de baseUrl en el código Flutter\n`;
    readme += `- Si usas un emulador Android, usa \`10.0.2.2:8080\` en lugar de \`localhost:8080\`\n\n`;
    
    readme += `---\n\n`;
    readme += `## 📄 Licencia\n\n`;
    readme += `Este proyecto fue generado automáticamente. Puedes modificarlo según tus necesidades.\n\n`;
    
    readme += `---\n`;
    readme += `**✨ Generado automáticamente desde diagrama UML ✨**\n`;
    
    return readme;
  }
}
