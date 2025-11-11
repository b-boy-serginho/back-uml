import { Injectable } from "@nestjs/common";
import { UMLDiagram, UMLClass, UMLRelation, UMLAttribute } from './interfaces/uml.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';

@Injectable ()

export class SpringbootStructureService {

public async generateConfigFiles(exportPath: string, projectName: string, basePackage: string) {
        // pom.xml
        const pomXml = this.generatePomXml(projectName, basePackage);
        await this.writeFile(path.join(exportPath, 'pom.xml'), pomXml);

        // application.properties
        const appProperties = this.generateApplicationProperties(projectName);
        await this.writeFile(path.join(exportPath, 'src/main/resources/application.properties'), appProperties);

        // Dockerfile
        const dockerfile = this.generateDockerfile();
        await this.writeFile(path.join(exportPath, 'Dockerfile'), dockerfile);

        // docker-compose.yml
        const dockerCompose = this.generateDockerCompose(projectName);
        await this.writeFile(path.join(exportPath, 'docker-compose.yml'), dockerCompose);

        // SwaggerConfig
        const swaggerConfig = this.generateSwaggerConfig(basePackage, projectName);
        await this.writeFile(
            path.join(exportPath, 'src/main/config/SwaggerConfig.java'),
            swaggerConfig
        );

        // Application main class
        const mainClass = this.generateMainClass(basePackage, projectName);
        await this.writeFile(
            path.join(exportPath, 'src/main/java', basePackage.replace(/\./g, '/'), projectName, `${this.capitalize(projectName)}Application.java`),
            mainClass
        );
    }

public generatePomXml(projectName: string, basePackage: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>${basePackage}</groupId>
    <artifactId>${projectName}</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>${projectName}</name>
    <description>Generated Spring Boot project from UML diagram</description>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.2.0</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>`;
  }

  public generateApplicationProperties(projectName: string): string {
    return `spring.application.name=${projectName}
server.port=8080

# Database Configuration
spring.datasource.url=jdbc:postgresql://localhost:5432/${projectName}_db
spring.datasource.username=postgres
spring.datasource.password=ale12345678
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA Configuration
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect

# Swagger Configuration
springdoc.api-docs.path=/api-docs
springdoc.swagger-ui.path=/swagger-ui.html`;
  }

  public generateDockerfile(): string {
    return `FROM openjdk:17-jdk-slim
WORKDIR /app
COPY target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]`;
  }

  public generateDockerCompose(projectName: string): string {
    return `version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ${projectName}_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${projectName}_db
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: postgres
    depends_on:
      - postgres

volumes:
  postgres_data:`;
  }

  public generateSwaggerConfig(basePackage: string, projectName: string): string {
    return `package ${basePackage}.${projectName}.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("${projectName} API")
                        .version("1.0")
                        .description("API Documentation for ${projectName}"));
    }
}`;
  }

  public generateMainClass(basePackage: string, projectName: string): string {
    const className = this.capitalize(projectName);
    return `package ${basePackage}.${projectName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className}Application {

    public static void main(String[] args) {
        SpringApplication.run(${className}Application.class, args);
    }
}`;
  }

  /**
   * Crea la estructura de directorios del proyecto
   */
  public async createProjectStructure(basePath: string, projectName: string, basePackage: string) {
        const dirs = [
            'src/main/java/' + basePackage.replace(/\./g, '/') + '/' + projectName + '/entity',
            'src/main/java/' + basePackage.replace(/\./g, '/') + '/' + projectName + '/dto',      // ⭐ DTO
            'src/main/java/' + basePackage.replace(/\./g, '/') + '/' + projectName + '/mapper',   // ⭐ Mapper
            'src/main/java/' + basePackage.replace(/\./g, '/') + '/' + projectName + '/repository',
            'src/main/java/' + basePackage.replace(/\./g, '/') + '/' + projectName + '/service',
            'src/main/java/' + basePackage.replace(/\./g, '/') + '/' + projectName + '/controller',
            'src/main/java/' + basePackage.replace(/\./g, '/') + '/' + projectName + '/config',
            'src/main/resources',
            'src/test/java/' + basePackage.replace(/\./g, '/') + '/' + projectName,
            'target',
        ];

        for (const dir of dirs) {
            await fs.promises.mkdir(path.join(basePath, dir), { recursive: true });
        }
    }

  /**
   * Escribe un archivo
   */
  public async writeFile(filePath: string, content: string) {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Comprime el proyecto en un ZIP
   */
 public async zipProject(projectPath: string, projectName: string): Promise<string> {
    const zipPath = path.join(process.cwd(), 'exportar', 'zips', `${projectName}.zip`);
    
    // Crear directorio de zips con recursive: true
    await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        // Limpiar el directorio temporal del proyecto después de comprimir
        try {
          await fs.promises.rm(projectPath, { recursive: true, force: true });
          console.log(`✓ Proyecto temporal eliminado: ${projectPath}`);
        } catch (error) {
          console.warn(`⚠ No se pudo eliminar el proyecto temporal: ${error.message}`);
        }
        resolve(zipPath);
      });

      archive.on('error', (err) => {
        console.error('Error al crear el archivo ZIP:', err);
        reject(err);
      });

      archive.pipe(output);
      archive.directory(projectPath, false);
      archive.finalize();
    });
  }

  /**
   * Sanitiza nombres para usar en archivos y paquetes
   */
  public sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Capitaliza la primera letra
   */
  public capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

}