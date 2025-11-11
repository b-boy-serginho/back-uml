import { Injectable } from '@nestjs/common';
import { UMLDiagram, UMLClass, UMLRelation, UMLAttribute, RelationMetadata, TransactionalMetadata } from './interfaces/uml.interface';
import * as fs from 'fs';
import * as path from 'path';
import { SpringbootStructureService } from './srpingboot-structure.service';



@Injectable()
export class SpringBootExportService {
    constructor(private readonly springbootStructureService: SpringbootStructureService) { }
    private javaTypeMapping: { [key: string]: string } = {
        'string': 'String',
        'String': 'String',
        'int': 'Integer',
        'Integer': 'Integer',
        'long': 'Long',
        'Long': 'Long',
        'double': 'Double',
        'Double': 'Double',
        'float': 'Float',
        'Float': 'Float',
        'boolean': 'Boolean',
        'Boolean': 'Boolean',
        'Date': 'Date',
        'LocalDate': 'LocalDate',
        'LocalDateTime': 'LocalDateTime',
        'BigDecimal': 'BigDecimal',
    };

    private async cleanOldZips(projectName: string): Promise<void> {
        const zipPath = path.join(process.cwd(), 'exportar', 'zips', `${projectName}.zip`);
        try {
            await fs.promises.unlink(zipPath);
            console.log(`✓ ZIP anterior eliminado: ${zipPath}`);
        } catch (error) {
            // Ignorar si no existe
        }
    }
    /**
     * Exporta un diagrama UML completo a un proyecto Spring Boot
     */
    async exportToSpringBoot(diagram: UMLDiagram, projectName: string, basePackage: string): Promise<string> {
        const sanitizedProjectName = this.sanitizeName(projectName);
        const exportPath = await path.join(process.cwd(), 'exportar', sanitizedProjectName);
        await this.cleanOldZips(await sanitizedProjectName);
        try {
            await fs.promises.rm(exportPath, { recursive: true, force: true });
        } catch (error) {
            // Ignorar si no existe
        }
        // Crear estructura de directorios
        await this.createProjectStructure(exportPath, sanitizedProjectName, basePackage);
        // Analizar relaciones primero
        const relationMetadata = this.analyzeRelations(diagram);
        // Generar entities
        for (const umlClass of diagram.classes) {
            // Generar Entity (para todas las clases)
            const entityCode = this.generateEntity(umlClass, diagram, relationMetadata, sanitizedProjectName);
            await this.writeFile(
                path.join(exportPath, 'src/main/java', basePackage.replace(/\./g, '/'), sanitizedProjectName, 'entity', `${umlClass.name}.java`),
                entityCode
            );

            // Generar Repository, Service y Controller (incluye clases de asociación)

            // Generar dto
            const dtoCode = this.generateDTO(umlClass, basePackage, sanitizedProjectName, relationMetadata);
            await this.writeFile(
                path.join(exportPath, 'src/main/java', basePackage.replace(/\./g, '/'), sanitizedProjectName, 'dto', `${umlClass.name}DTO.java`),
                dtoCode
            );

            // ⭐ Generar Mapper
            const mapperCode = this.generateMapper(umlClass, basePackage, sanitizedProjectName, relationMetadata);
            await this.writeFile(
                path.join(exportPath, 'src/main/java', basePackage.replace(/\./g, '/'), sanitizedProjectName, 'mapper', `${umlClass.name}Mapper.java`),
                mapperCode
            );


            // Generar Repository
            const repositoryCode = this.generateRepository(umlClass, basePackage, sanitizedProjectName, relationMetadata);
            await this.writeFile(
                path.join(exportPath, 'src/main/java', basePackage.replace(/\./g, '/'), sanitizedProjectName, 'repository', `${umlClass.name}Repository.java`),
                repositoryCode
            );
            // Generar Service
            const serviceCode = this.generateService(umlClass, basePackage, sanitizedProjectName, relationMetadata);
            await this.writeFile(
                path.join(exportPath, 'src/main/java', basePackage.replace(/\./g, '/'), sanitizedProjectName, 'service', `${umlClass.name}Service.java`),
                serviceCode
            );

            // Generar Controller
            const controllerCode = this.generateController(umlClass, basePackage, sanitizedProjectName);
            await this.writeFile(
                path.join(exportPath, 'src/main/java', basePackage.replace(/\./g, '/'), sanitizedProjectName, 'controller', `${umlClass.name}Controller.java`),
                controllerCode
            );
        }

        // Generar archivos de configuración
        await this.generateConfigFiles(exportPath, sanitizedProjectName, basePackage);
        
        // Generar README con endpoints de Postman
        await this.generateReadmeWithEndpoints(exportPath, sanitizedProjectName, basePackage, diagram);
        
        // Comprimir proyecto
        const zipPath = await this.zipProject(exportPath, sanitizedProjectName);
        return zipPath;
    }

    /**
     * Analiza todas las relaciones del diagrama y genera metadata
     */
    public analyzeRelations(diagram: UMLDiagram): Map<string, RelationMetadata[]> {
        const metadata = new Map<string, RelationMetadata[]>();

        // Inicializar mapa para todas las clases
        diagram.classes.forEach(cls => {
            metadata.set(cls.id, []);
        });

        // Procesar cada relación
        diagram.relations.forEach(relation => {
            const fromClass = diagram.classes.find(c => c.id === relation.fromClassId);
            const toClass = diagram.classes.find(c => c.id === relation.toClassId);

            if (!fromClass || !toClass) return;

            // ✅ CORREGIDO: Manejar clases de asociación (verificar si tiene associationClassId)
            if (relation.associationClassId) {
                this.handleAssociationClass(relation, diagram, metadata);
                return;
            }

            // Procesar relaciones normales
            switch (relation.type) {
                case 'association':
                    this.handleAssociation(relation, fromClass, toClass, metadata);
                    break;
                case 'aggregation':
                    this.handleAggregation(relation, fromClass, toClass, metadata);
                    break;
                case 'composition':
                    this.handleComposition(relation, fromClass, toClass, metadata);
                    break;
                case 'inheritance':
                    // La herencia se maneja directamente en la generación de entidades
                    break;
                case 'realization':
                    // La realización (implementación de interfaces) se maneja en la generación
                    break;
            }
        });

        return metadata;
    }
    /**
     * Maneja clases de asociación (relaciones Many-to-Many con atributos)
     */
    private handleAssociationClass(
        relation: UMLRelation,
        diagram: UMLDiagram,
        metadata: Map<string, RelationMetadata[]>
    ) {
        const assocClass = diagram.classes.find(c => c.id === relation.associationClassId);
        const fromClass = diagram.classes.find(c => c.id === relation.fromClassId);
        const toClass = diagram.classes.find(c => c.id === relation.toClassId);

        if (!assocClass || !fromClass || !toClass) {
            console.warn(`Clase de asociación incompleta:`, {
                assocClass: assocClass?.name,
                fromClass: fromClass?.name,
                toClass: toClass?.name
            });
            return;
        }

        // Asegurarse de que las entradas existen en metadata
        if (!metadata.has(assocClass.id)) {
            metadata.set(assocClass.id, []);
        }
        if (!metadata.has(fromClass.id)) {
            metadata.set(fromClass.id, []);
        }
        if (!metadata.has(toClass.id)) {
            metadata.set(toClass.id, []);
        }

        // La clase de asociación tendrá relaciones Many-to-One con ambas clases
        const fromFieldName = this.generateUniqueFieldName(fromClass.name.toLowerCase(), assocClass.id, metadata);
        const toFieldName = this.generateUniqueFieldName(toClass.name.toLowerCase(), assocClass.id, metadata);

        metadata.get(assocClass.id).push({
            type: 'ManyToOne',
            targetClass: fromClass.name,
            fieldName: fromFieldName,
            isOwner: true,
        });

        metadata.get(assocClass.id).push({
            type: 'ManyToOne',
            targetClass: toClass.name,
            fieldName: toFieldName,
            isOwner: true,
        });

        // Las clases originales tendrán relaciones One-to-Many con la clase de asociación
        metadata.get(fromClass.id).push({
            type: 'OneToMany',
            targetClass: assocClass.name,
            fieldName: this.pluralize(assocClass.name.toLowerCase()),
            mappedBy: fromFieldName,
            isOwner: false,
        });

        metadata.get(toClass.id).push({
            type: 'OneToMany',
            targetClass: assocClass.name,
            fieldName: this.pluralize(assocClass.name.toLowerCase()),
            mappedBy: toFieldName,
            isOwner: false,
        });
    }

    /**
     * Maneja asociaciones normales
     */
    private handleAssociation(
        relation: UMLRelation,
        fromClass: UMLClass,
        toClass: UMLClass,
        metadata: Map<string, RelationMetadata[]>
    ) {
        const fromMult = relation.multiplicity?.from || '1';
        const toMult = relation.multiplicity?.to || '1';

        if (this.isMany(fromMult) && this.isMany(toMult)) {
            // Many-to-Many
            const fromFieldName = this.generateUniqueFieldName(
                this.pluralize(toClass.name.toLowerCase()),
                fromClass.id,
                metadata
            );

            metadata.get(fromClass.id).push({
                type: 'ManyToMany',
                targetClass: toClass.name,
                fieldName: fromFieldName,
                isOwner: true,
                multiplicity: relation.multiplicity,
            });

            const toFieldName = this.generateUniqueFieldName(
                this.pluralize(fromClass.name.toLowerCase()),
                toClass.id,
                metadata
            );

            metadata.get(toClass.id).push({
                type: 'ManyToMany',
                targetClass: fromClass.name,
                fieldName: toFieldName,
                mappedBy: fromFieldName,
                isOwner: false,
                multiplicity: relation.multiplicity,
            });
        } else if (this.isMany(toMult)) {
            // One-to-Many
            const fromFieldName = this.generateUniqueFieldName(
                this.pluralize(toClass.name.toLowerCase()),
                fromClass.id,
                metadata
            );

            metadata.get(fromClass.id).push({
                type: 'OneToMany',
                targetClass: toClass.name,
                fieldName: fromFieldName,
                mappedBy: fromClass.name.toLowerCase(),
                isOwner: false,
                multiplicity: relation.multiplicity,
            });

            const toFieldName = this.generateUniqueFieldName(
                fromClass.name.toLowerCase(),
                toClass.id,
                metadata
            );

            metadata.get(toClass.id).push({
                type: 'ManyToOne',
                targetClass: fromClass.name,
                fieldName: toFieldName,
                isOwner: true,
                multiplicity: relation.multiplicity,
            });
        } else {
            // One-to-One
            const fromFieldName = this.generateUniqueFieldName(
                toClass.name.toLowerCase(),
                fromClass.id,
                metadata
            );

            metadata.get(fromClass.id).push({
                type: 'OneToOne',
                targetClass: toClass.name,
                fieldName: fromFieldName,
                isOwner: true,
                multiplicity: relation.multiplicity,
            });

            const toFieldName = this.generateUniqueFieldName(
                fromClass.name.toLowerCase(),
                toClass.id,
                metadata
            );

            metadata.get(toClass.id).push({
                type: 'OneToOne',
                targetClass: fromClass.name,
                fieldName: toFieldName,
                mappedBy: fromFieldName,
                isOwner: false,
                multiplicity: relation.multiplicity,
            });
        }
    }

    /**
     * Maneja agregaciones
     */
    private handleAggregation(
        relation: UMLRelation,
        fromClass: UMLClass,
        toClass: UMLClass,
        metadata: Map<string, RelationMetadata[]>
    ) {
        // Similar a asociación pero con semántica de agregación
        this.handleAssociation(relation, fromClass, toClass, metadata);
    }

    /**
     * Maneja composiciones
     */
    private handleComposition(
        relation: UMLRelation,
        fromClass: UMLClass,
        toClass: UMLClass,
        metadata: Map<string, RelationMetadata[]>
    ) {
        // Composición implica cascade y orphanRemoval
        const toMult = relation.multiplicity?.to || '1';

        const fieldName = this.generateUniqueFieldName(
            this.isMany(toMult) ? this.pluralize(toClass.name.toLowerCase()) : toClass.name.toLowerCase(),
            fromClass.id,
            metadata
        );

        if (this.isMany(toMult)) {
            metadata.get(fromClass.id).push({
                type: 'OneToMany-Composition',
                targetClass: toClass.name,
                fieldName: fieldName,
                mappedBy: fromClass.name.toLowerCase(),
                isOwner: false,
                multiplicity: relation.multiplicity,
            });

            metadata.get(toClass.id).push({
                type: 'ManyToOne',
                targetClass: fromClass.name,
                fieldName: this.generateUniqueFieldName(fromClass.name.toLowerCase(), toClass.id, metadata),
                isOwner: true,
                multiplicity: relation.multiplicity,
            });
        } else {
            metadata.get(fromClass.id).push({
                type: 'OneToOne-Composition',
                targetClass: toClass.name,
                fieldName: fieldName,
                isOwner: true,
                multiplicity: relation.multiplicity,
            });
        }
    }

    /**
     * Genera un nombre de campo único para evitar duplicados
     */
    private generateUniqueFieldName(
        baseName: string,
        classId: string,
        metadata: Map<string, RelationMetadata[]>
    ): string {
        const existingFields = metadata.get(classId) || [];
        let fieldName = baseName;
        let counter = 1;

        while (existingFields.some(f => f.fieldName === fieldName)) {
            fieldName = `${baseName}${counter}`;
            counter++;
        }

        return fieldName;
    }

    /**
     * Determina si una multiplicidad representa "muchos"
     */
    private isMany(multiplicity: string): boolean {
        return multiplicity === '*' || multiplicity === '0..*' || multiplicity === '1..*' || multiplicity.includes('n');
    }

    /**
     * Pluraliza un nombre (simple)
     */
    private pluralize(name: string): string {
        if (name.endsWith('s') || name.endsWith('x') || name.endsWith('z')) {
            return `${name}es`;
        } else if (name.endsWith('y')) {
            return `${name.slice(0, -1)}ies`;
        }
        return `${name}s`;
    }

    /**
     * Genera el código de una entidad JPA
     */
    // ...existing code...

    /**
     * Genera el código de una entidad JPA
     */
    // ...existing code...

    /**
     * Genera el código de una entidad JPA
     */
    private generateEntity(
        umlClass: UMLClass,
        diagram: UMLDiagram,
        relationMetadata: Map<string, RelationMetadata[]>,
        projectName: string
    ): string {
        const className = umlClass.name;
        const isAbstract = umlClass.isAbstract || false;
        const isInterface = umlClass.isInterface || false;
        const stereotype = umlClass.stereotype;

        // Buscar herencia
        const inheritanceRelation = diagram.relations.find(
            r => r.type === 'inheritance' && r.fromClassId === umlClass.id
        );
        const parentClass = inheritanceRelation
            ? diagram.classes.find(c => c.id === inheritanceRelation.toClassId)
            : null;

        // Buscar interfaces implementadas
        const realizationRelations = diagram.relations.filter(
            r => r.type === 'realization' && r.fromClassId === umlClass.id
        );
        const interfaces = realizationRelations
            .map(r => diagram.classes.find(c => c.id === r.toClassId))
            .filter(c => c != null);

        let code = '';

        // Package
        code += `package com.ejemplo.${projectName}.entity;\n\n`;

        // Imports
        code += this.generateImports(umlClass, relationMetadata, stereotype);

        // Anotaciones Lombok
        code += `@Setter\n@Getter\n`;

        // Anotaciones JPA - TODAS las clases son @Entity
        if (!isInterface) {
            code += `@Entity\n`;
            code += `@Table(name = "tbl_${className.toLowerCase()}")\n`;
        }

        // Declaración de clase
        if (isInterface) {
            code += `public interface ${className}`;
        } else {
            code += `public ${isAbstract ? 'abstract ' : ''}class ${className}`;

            if (parentClass) {
                code += ` extends ${parentClass.name}`;
            }

            if (interfaces.length > 0) {
                code += ` implements ${interfaces.map(i => i.name).join(', ')}`;
            }
        }
        code += ` {\n\n`;

        if (!isInterface) {
            // 🔍 DEBUG: Log de relaciones
            const allRelations = relationMetadata.get(umlClass.id) || [];
            if (allRelations.length > 0) {
                console.log(`✅ [${className}] Relaciones encontradas:`, allRelations.map(r => `${r.fieldName}: ${r.type} -> ${r.targetClass}`));
            } else {
                console.log(`⚠️ [${className}] NO hay relaciones en metadata`);
            }

            // ⭐ Filtrar atributos: eliminar IDs, Foreign Keys, y atributos que coincidan con relaciones
            const filteredAttributes = this.filterAttributesStrict(umlClass.attributes, className, allRelations);

            // ⭐ Buscar atributo marcado como Primary Key
            const pkAttribute = filteredAttributes.find(attr => attr.isPrimaryKey === true);

            if (pkAttribute) {
                // CASO 1: Hay un atributo marcado explícitamente como PK
                code += `    @Id\n`;
                code += `    @GeneratedValue(strategy = GenerationType.IDENTITY)\n`;

                const columnAnnotations = this.generateColumnAnnotations(pkAttribute);
                if (columnAnnotations) {
                    code += columnAnnotations;
                }

                code += `    private ${this.mapType(pkAttribute.type)} ${pkAttribute.name};\n\n`;
            } else {
                // CASO 2: No hay PK explícita, crear una automática
                code += `    @Id\n`;
                code += `    @GeneratedValue(strategy = GenerationType.IDENTITY)\n`;
                code += `    private Long id;\n\n`;
            }

            // Atributos normales (excluir el PK ya generado)
            filteredAttributes.forEach(attr => {
                if (attr !== pkAttribute) {
                    code += this.generateAttribute(attr);
                }
            });

            // Relaciones
            allRelations.forEach(rel => {
                code += this.generateRelationField(rel);
            });
        }

        code += `}\n`;

        return code;
    }


    // ...existing code...

    /**
     * Genera un DTO para una entidad
     */
    /**
 * Genera un DTO para una entidad
 */
    private generateDTO(umlClass: UMLClass, basePackage: string, projectName: string, relationMetadata: Map<string, RelationMetadata[]>): string {
        const className = umlClass.name;
        const dtoName = `${className}DTO`;

        // Obtener relaciones de esta clase
        const dtoRelations = relationMetadata.get(umlClass.id) || [];

        // Filtrar solo atributos normales (sin IDs ni FKs)
        const filteredAttributes = this.filterAttributesStrict(umlClass.attributes, className, dtoRelations);

        let code = `package ${basePackage}.${projectName}.dto;\n\n`;
        code += `import lombok.AllArgsConstructor;\n`;
        code += `import lombok.Getter;\n`;
        code += `import lombok.NoArgsConstructor;\n`;
        code += `import lombok.Setter;\n\n`;
        code += `import java.util.Date;\n\n`;

        // Imports para tipos especiales
        const hasLocalDate = filteredAttributes.some(a => a.type === 'LocalDate');
        const hasLocalDateTime = filteredAttributes.some(a => a.type === 'LocalDateTime');
        const hasBigDecimal = filteredAttributes.some(a => a.type === 'BigDecimal');

        if (hasLocalDate) code += `import java.time.LocalDate;\n`;
        if (hasLocalDateTime) code += `import java.time.LocalDateTime;\n`;
        if (hasBigDecimal) code += `import java.math.BigDecimal;\n`;

        code += `\n@Getter\n@Setter\n@NoArgsConstructor\n@AllArgsConstructor\n`;
        code += `public class ${dtoName} {\n\n`;

        // ✅ AGREGAR: ID de la entidad
        code += `    private Long id;\n\n`;

        // Atributos del DTO
        filteredAttributes.forEach(attr => {
            code += `    private ${this.mapType(attr.type)} ${attr.name};\n`;
        });

        // ✅ AGREGAR: IDs de las relaciones (Foreign Keys)
        const relations = relationMetadata.get(umlClass.id) || [];

        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                // Para relaciones propietarias, agregar el ID de la entidad relacionada
                code += `    private Long ${rel.fieldName}Id;\n`;
            }
        });

        code += `\n}\n`;

        return code;
    }

    // ...existing code...


    // ...existing code...

    /**
     * Genera un Mapper para convertir Entity <-> DTO
     */
    private generateMapper(umlClass: UMLClass, basePackage: string, projectName: string, relationMetadata: Map<string, RelationMetadata[]>): string {
        const className = umlClass.name;
        const dtoName = `${className}DTO`;
        const mapperName = `${className}Mapper`;
        const entityVar = className.charAt(0).toLowerCase() + className.slice(1);
        const dtoVar = dtoName.charAt(0).toLowerCase() + dtoName.slice(1);

        let code = `package ${basePackage}.${projectName}.mapper;\n\n`;
        code += `import ${basePackage}.${projectName}.entity.${className};\n`;
        code += `import ${basePackage}.${projectName}.dto.${dtoName};\n`;
        code += `import org.springframework.stereotype.Component;\n\n`;
        code += `@Component\n`;
        code += `public class ${mapperName} {\n\n`;

        // toDTO
        code += `    public ${dtoName} toDTO(${className} ${entityVar}) {\n`;
        code += `        if (${entityVar} == null) {\n`;
        code += `            return null;\n`;
        code += `        }\n\n`;
        code += `        ${dtoName} ${dtoVar} = new ${dtoName}();\n`;
        code += `        ${dtoVar}.setId(${entityVar}.getId());\n`;

        // Obtener relaciones de esta clase
        const relations = relationMetadata.get(umlClass.id) || [];
        
        // Mapear atributos normales (filtrando también por relaciones)
        const filteredAttributes = this.filterAttributesStrict(umlClass.attributes, className, relations);
        filteredAttributes.forEach(attr => {
            code += `        ${dtoVar}.set${this.capitalize(attr.name)}(${entityVar}.get${this.capitalize(attr.name)}());\n`;
        });

        // Mapear IDs de relaciones SOLO en toDTO (entity -> DTO)
        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                code += `        if (${entityVar}.get${this.capitalize(rel.fieldName)}() != null) {\n`;
                code += `            ${dtoVar}.set${this.capitalize(rel.fieldName)}Id(${entityVar}.get${this.capitalize(rel.fieldName)}().getId());\n`;
                code += `        }\n`;
            }
        });

        code += `        return ${dtoVar};\n`;
        code += `    }\n\n`;

        // toEntity - ❌ NO mapea relaciones, solo atributos simples
        code += `    public ${className} toEntity(${dtoName} ${dtoVar}) {\n`;
        code += `        if (${dtoVar} == null) {\n`;
        code += `            return null;\n`;
        code += `        }\n\n`;
        code += `        ${className} ${entityVar} = new ${className}();\n`;
        code += `        ${entityVar}.setId(${dtoVar}.getId());\n`;

        filteredAttributes.forEach(attr => {
            code += `        ${entityVar}.set${this.capitalize(attr.name)}(${dtoVar}.get${this.capitalize(attr.name)}());\n`;
        });

        code += `        return ${entityVar};\n`;
        code += `    }\n`;
        code += `}\n`;

        return code;
    }

    // ✅ Genera un DTO transaccional SOLO con los detalles
    private generateTransactionalItemDTO(
        transactionClass: UMLClass,
        detailClass: UMLClass,
        basePackage: string,
        projectName: string
    ): string {
        const transactionName = transactionClass.name;
        const detailName = detailClass.name;
        const itemDtoName = `${transactionName}${detailName}ItemDTO`;

        let code = `package ${basePackage}.${projectName}.dto;\n\n`;
        code += `import lombok.AllArgsConstructor;\n`;
        code += `import lombok.Getter;\n`;
        code += `import lombok.NoArgsConstructor;\n`;
        code += `import lombok.Setter;\n`;

        // ✅ Agregar imports para tipos especiales
        const itemDtoAttributes = this.filterAttributesStrict(transactionClass.attributes, transactionName);
        const hasLocalDate = itemDtoAttributes.some(a => a.type === 'LocalDate');
        const hasLocalDateTime = itemDtoAttributes.some(a => a.type === 'LocalDateTime');
        const hasBigDecimal = itemDtoAttributes.some(a => a.type === 'BigDecimal');

        if (hasLocalDate) code += `import java.time.LocalDate;\n`;
        if (hasLocalDateTime) code += `import java.time.LocalDateTime;\n`;
        if (hasBigDecimal) code += `import java.math.BigDecimal;\n`;

        code += `\n@Getter\n@Setter\n@NoArgsConstructor\n@AllArgsConstructor\n`;
        code += `public class ${itemDtoName} {\n\n`;

        // Atributos del detalle (sin IDs ni FKs)
        const transactionAttributes = this.filterAttributesStrict(transactionClass.attributes, transactionName);
        transactionAttributes.forEach(attr => {
            code += `    private ${this.mapType(attr.type)} ${attr.name};\n`;
        });

        code += `\n    // FK al detalle\n`;
        code += `    private Long ${detailName.charAt(0).toLowerCase()}${detailName.slice(1)}Id;\n\n`;

        code += `}\n`;

        return code;
    }

    // ✅ Agrega los detalles al DTO de la cabecera (Maestro)
    private addTransactionalDetailsToDTO(
        masterDtoCode: string,
        transactionName: string,
        detailName: string
    ): string {
        const itemDtoName = `${transactionName}${detailName}ItemDTO`;

        // Buscar si ya existe el campo detalles (para no duplicar)
        if (masterDtoCode.includes(`List<${itemDtoName}>`)) {
            return masterDtoCode; // Ya existe, no agregar
        }

        // Agregar import de List si no existe
        if (!masterDtoCode.includes('import java.util.List')) {
            const importIndex = masterDtoCode.indexOf('import lombok');
            const lines = masterDtoCode.split('\n');
            const importLine = lines.findIndex(l => l.includes('import lombok'));
            lines.splice(importLine + 4, 0, 'import java.util.List;');
            masterDtoCode = lines.join('\n');
        }

        // Encontrar la última línea antes del cierre de clase
        const lines = masterDtoCode.split('\n');
        const classClosingIndex = lines.length - 2; // Antes del cierre }

        // Insertar el campo detalles
        lines.splice(classClosingIndex, 0, `    private List<${itemDtoName}> detalles;\n`);

        return lines.join('\n');
    }

    // ✅ Agrega método transaccional AL SERVICE DE LA CABECERA
    private addTransactionalMethodToService(
        masterServiceCode: string,
        masterName: string,
        detailName: string,
        transactionClass: UMLClass,
        basePackage: string,
        projectName: string,
        relationMetadata: Map<string, RelationMetadata[]>
    ): string {
        const transactionName = transactionClass.name;
        const masterVar = masterName.charAt(0).toLowerCase() + masterName.slice(1);
        const detailVar = detailName.charAt(0).toLowerCase() + detailName.slice(1);
        const transactionVar = transactionName.charAt(0).toLowerCase() + transactionName.slice(1);
        const isAssociationClass = transactionClass.stereotype === '<<association>>';

        // ✅ Construir método transaccional
        let newMethod = `\n    // ✅ TODO O NADA: Guardar maestro + detalles (Transaccional)\n`;
        newMethod += `    @Transactional\n`;
        newMethod += `    public ${masterName} saveWithDetails(${masterName}DTO ${masterVar}DTO) {\n`;
        newMethod += `        // 1️⃣ Guardar la cabecera\n`;
        newMethod += `        ${masterName} ${masterVar} = mapper.toEntity(${masterVar}DTO);\n`;
        newMethod += `        ${masterName} saved${masterName} = repository.save(${masterVar});\n\n`;

        newMethod += `        // 2️⃣ Guardar los detalles\n`;
        newMethod += `        if (${masterVar}DTO.getDetalles() != null && !${masterVar}DTO.getDetalles().isEmpty()) {\n`;
        newMethod += `            ${masterVar}DTO.getDetalles().forEach(detalleDTO -> {\n`;
        newMethod += `                ${transactionName} ${transactionVar} = new ${transactionName}();\n`;
        newMethod += `                ${transactionVar}.set${masterName}(saved${masterName});\n`;

        const transactionAttributes = this.filterAttributesStrict(transactionClass.attributes, transactionName);
        transactionAttributes.forEach(attr => {
            newMethod += `                ${transactionVar}.set${this.capitalize(attr.name)}(detalleDTO.get${this.capitalize(attr.name)}());\n`;
        });

        newMethod += `                \n`;
        newMethod += `                if (detalleDTO.get${detailName}Id() != null) {\n`;
        newMethod += `                    Optional<${detailName}> ${detailVar}Optional = ${detailVar}Repository.findById(detalleDTO.get${detailName}Id());\n`;
        newMethod += `                    if (${detailVar}Optional.isPresent()) {\n`;
        newMethod += `                        ${transactionVar}.set${detailName}(${detailVar}Optional.get());\n`;
        newMethod += `                    }\n`;
        newMethod += `                }\n`;
        newMethod += `                \n`;

        // ✅ Si es clase de asociación, usar EntityManager; si no, usar Repository
        if (isAssociationClass) {
            newMethod += `                entityManager.persist(${transactionVar});\n`;
        } else {
            newMethod += `                ${transactionVar}Repository.save(${transactionVar});\n`;
        }

        newMethod += `            });\n`;
        newMethod += `        }\n\n`;

        newMethod += `        return saved${masterName};\n`;
        newMethod += `    }\n`;

        // ✅ Agregar método para traer detalles con JOIN FETCH
        newMethod += `\n    // ✅ Traer todas las entidades CON sus detalles\n`;
        newMethod += `    public List<${masterName}> findAllWithDetails() {\n`;
        newMethod += `        return repository.findAllWithDetails();\n`;
        newMethod += `    }\n`;

        // ============================================
        // 1️⃣ AGREGAR IMPORTS
        // ============================================
        let lines = masterServiceCode.split('\n');
        const lastImportIndex = lines.map((l, i) => l.includes('import ') ? i : -1).filter(i => i !== -1).pop() || 0;

        // ✅ Agregar import de la clase de asociación (ItemCarrito)
        if (!masterServiceCode.includes(`import ${basePackage}.${projectName}.entity.${transactionName}`)) {
            lines.splice(lastImportIndex + 1, 0, `import ${basePackage}.${projectName}.entity.${transactionName};`);
        }

        // ✅ Agregar import de la clase de detalle (Producto)
        if (!masterServiceCode.includes(`import ${basePackage}.${projectName}.entity.${detailName}`) && transactionName !== detailName) {
            lines.splice(lastImportIndex + 1, 0, `import ${basePackage}.${projectName}.entity.${detailName};`);
        }

        if (!masterServiceCode.includes(`import ${basePackage}.${projectName}.repository.${detailName}Repository`) && transactionName !== detailName) {
            lines.splice(lastImportIndex + 1, 0, `import ${basePackage}.${projectName}.repository.${detailName}Repository;`);
        }

        // ✅ Agregar imports necesarios
        if (!masterServiceCode.includes('import org.springframework.transaction.annotation.Transactional')) {
            lines.splice(lastImportIndex + 1, 0, 'import org.springframework.transaction.annotation.Transactional;');
        }

        if (!masterServiceCode.includes('import java.util.Optional')) {
            lines.splice(lastImportIndex + 1, 0, 'import java.util.Optional;');
        }

        // ✅ Si es clase de asociación, agregar imports de EntityManager
        if (isAssociationClass && !masterServiceCode.includes('import jakarta.persistence.EntityManager')) {
            lines.splice(lastImportIndex + 1, 0, 'import jakarta.persistence.PersistenceContext;');
            lines.splice(lastImportIndex + 1, 0, 'import jakarta.persistence.EntityManager;');
        }

        let updatedCode = lines.join('\n');

        // ============================================
        // 2️⃣ AGREGAR INYECCIONES (DESPUÉS de imports)
        // ============================================
        lines = updatedCode.split('\n');

        // ✅ Inyectar repositorio de DETALLE (Producto) - SIEMPRE necesario
        const detailRepoName = `${detailName}Repository`;
        if (!updatedCode.includes(`private ${detailRepoName}`)) {
            const detailRepoInjection = `    @Autowired\n    private ${detailRepoName} ${detailVar}Repository;`;

            // Encontrar dónde insertar: después de otros @Autowired de repositorios
            let insertIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('@Service') || lines[i].includes('public class')) {
                    insertIndex = i;
                    break;
                }
            }

            // Buscar la primera inyección @Autowired después de @Service
            for (let i = insertIndex; i < lines.length; i++) {
                if (lines[i].includes('@Autowired') && lines[i + 1]?.includes('private')) {
                    // Buscar el final de esas inyecciones
                    let j = i;
                    while (j < lines.length && (lines[j].includes('@Autowired') || lines[j].includes('private'))) {
                        j++;
                    }
                    insertIndex = j;
                    break;
                }
            }

            if (insertIndex > -1) {
                lines.splice(insertIndex, 0, detailRepoInjection);
            }
        }

        updatedCode = lines.join('\n');

        // ✅ Si es clase de asociación, inyectar EntityManager con @PersistenceContext
        if (isAssociationClass && !updatedCode.includes('EntityManager entityManager')) {
            const entityManagerInjection = `    @PersistenceContext\n    private EntityManager entityManager;`;
            lines = updatedCode.split('\n');

            // Insertar después de @Service/class
            let insertIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('public class')) {
                    insertIndex = i + 1;
                    break;
                }
            }

            if (insertIndex > -1) {
                lines.splice(insertIndex, 0, entityManagerInjection);
            }

            updatedCode = lines.join('\n');
        }

        // Insertar el método antes del cierre final de la clase
        const classClosing = updatedCode.lastIndexOf('}');
        return updatedCode.substring(0, classClosing) + newMethod + updatedCode.substring(classClosing);
    }// ...existing code...


    /**
     * Filtra atributos eliminando IDs y Foreign Keys de forma rigurosa
     * Elimina cualquier atributo que parezca ser una llave primaria o foránea
     */
    private filterAttributesStrict(attributes: UMLAttribute[], className: string, relations: RelationMetadata[] = []): UMLAttribute[] {
        return attributes.filter(attr => {
            const lowerName = attr.name.toLowerCase();
            const classNameLower = className.toLowerCase();

            // ❌ ELIMINAR: Atributo exacto "id"
            if (lowerName === 'id') {
                console.warn(`⚠ Se eliminó atributo "id" de la clase "${className}" (reservado como PK automática)`);
                return false;
            }

            // ❌ ELIMINAR: Patrones de Primary Key (xxId, xxID, id_xx, etc)
            const pkPatterns = [
                new RegExp(`^${classNameLower}id$`, 'i'),        // productoId, PRODUCTOID, etc
                new RegExp(`^${classNameLower}_id$`, 'i'),       // producto_id, PRODUCTO_ID, etc
                new RegExp(`^id_${classNameLower}$`, 'i'),       // id_producto, ID_PRODUCTO, etc
                /^[a-z]+id$/i,                                   // anyId, ANYID, etc
                /^id[a-z]+$/i,                                   // idAny, IDANY, etc
                /^[a-z]+_id$/i,                                  // any_id, ANY_ID, etc
                /^id_[a-z]+$/i,                                  // id_any, ID_ANY, etc
            ];

            for (const pattern of pkPatterns) {
                if (pattern.test(lowerName)) {
                    console.warn(`⚠ Se eliminó atributo "${attr.name}" de "${className}" (patrón de PK detectado)`);
                    return false;
                }
            }

            // ❌ ELIMINAR: Foreign Keys (terminan en "Id" pero no son del mismo nombre de clase)
            // Buscar patrones como: usuarioId, categoriaId, etc (cualquier cosa + Id)
            if (lowerName.endsWith('id') && lowerName !== classNameLower + 'id') {
                // Validar que no sea un atributo normal que termine en "id"
                // Ej: "credentialId" de "Credential" sería eliminado
                const baseClass = lowerName.replace(/id$/, '');

                // Si el base es diferente al nombre de la clase, es probablemente una FK
                if (baseClass !== classNameLower) {
                    console.warn(`⚠ Se eliminó atributo "${attr.name}" de "${className}" (patrón de Foreign Key detectado)`);
                    return false;
                }
            }

            // ❌ ELIMINAR: Patrones con underscore (user_id, categoria_id, etc)
            if (lowerName.includes('_') && lowerName.endsWith('_id')) {
                console.warn(`⚠ Se eliminó atributo "${attr.name}" de "${className}" (patrón de Foreign Key con underscore)`);
                return false;
            }

            // ❌ ELIMINAR: Atributos que coinciden con nombres de relaciones (evitar duplicados)
            if (relations.length > 0) {
                const relationNames = relations.map(r => r.fieldName.toLowerCase());
                if (relationNames.includes(lowerName)) {
                    console.warn(`⚠ Se eliminó atributo "${attr.name}" de "${className}" (coincide con relación de misma clase - evitar duplicado)`);
                    return false;
                }
            }

            // ✅ MANTENER: Atributo válido
            return true;
        });
    }

    // ...existing code...

    // ...existing code...



    private generateColumnAnnotations(attr: UMLAttribute): string {
        const annotations: string[] = [];

        // Nombre de columna personalizado
        if (attr.columnName) {
            annotations.push(`name = "${attr.columnName}"`);
        }

        // Unique constraint
        if (attr.isUnique) {
            annotations.push('unique = true');
        }

        // Nullable
        if (attr.isNullable !== undefined) {
            annotations.push(`nullable = ${attr.isNullable}`);
        }

        if (annotations.length > 0) {
            return `    @Column(${annotations.join(', ')})\n`;
        }

        return '';
    }



    /**
     * Genera los imports necesarios
     */
    private generateImports(
        umlClass: UMLClass,
        relationMetadata: Map<string, RelationMetadata[]>,
        stereotype?: string
    ): string {
        let imports = new Set<string>();

        // Imports básicos de JPA - PARA TODAS LAS ENTIDADES
        if (!umlClass.isInterface) {
            imports.add('import jakarta.persistence.*;');
            imports.add('import jakarta.persistence.Table;');
            imports.add('import com.fasterxml.jackson.annotation.JsonIgnore;');
            imports.add('import lombok.*;');
        }

        // Imports para tipos especiales
        umlClass.attributes.forEach(attr => {
            if (attr.type === 'Date') {
                imports.add('import java.util.Date;');
            } else if (attr.type === 'LocalDate') {
                imports.add('import java.time.LocalDate;');
            } else if (attr.type === 'LocalDateTime') {
                imports.add('import java.time.LocalDateTime;');
            } else if (attr.type === 'BigDecimal') {
                imports.add('import java.math.BigDecimal;');
            }
        });

        // Imports para colecciones
        const relations = relationMetadata.get(umlClass.id) || [];
        if (relations.some(r => r.type.includes('Many'))) {
            imports.add('import java.util.*;');
        }

        return Array.from(imports).join('\n') + '\n';
    }

    /**
     * Genera el código de un atributo
     */
    // ...existing code...

    /**
     * Genera el código de un atributo
     */
    private generateAttribute(attr: UMLAttribute): string {
        let code = '';
        const javaType = this.mapType(attr.type);
        const visibility = this.mapVisibility(attr.visibility);

        // DEFENSA EXTRA: Validar que no sea un ID o FK que se coló
        const lowerName = attr.name.toLowerCase();
        if (lowerName.endsWith('id') || lowerName === 'id' || lowerName.includes('_id')) {
            console.warn(`⚠ ADVERTENCIA: Atributo sospechoso detectado: "${attr.name}" (podría ser PK/FK)`);
            // Aún así lo genera, pero genera un warning
        }

        // Agregar anotaciones de columna con constraints
        const columnAnnotations = this.generateColumnAnnotations(attr);
        if (columnAnnotations) {
            code += columnAnnotations;
        }

        code += `    ${visibility}${attr.isStatic ? ' static' : ''} ${javaType} ${attr.name}`;

        // Agregar valor por defecto si está definido
        if (attr.defaultValue) {
            // Escapar strings
            const defaultVal = javaType === 'String'
                ? `"${attr.defaultValue}"`
                : attr.defaultValue;
            code += ` = ${defaultVal}`;
        }

        code += `;\n\n`;

        return code;
    }

    // ...existing code...

    /**
     * Genera el código de un campo de relación
     */
    /**
  * Genera el código de un campo de relación
  */
    private generateRelationField(rel: RelationMetadata): string {
        let code = '';
        const isCollection = rel.type.includes('Many') && !rel.type.startsWith('ManyToOne');
        const fieldType = isCollection ? `Set<${rel.targetClass}>` : rel.targetClass;

        // Anotación de relación
        if (rel.type.includes('Composition')) {
            const baseType = rel.type.split('-')[0]; // OneToMany o OneToOne
            if (!rel.isOwner && rel.mappedBy) {
                code += `    @${baseType}(cascade = CascadeType.ALL, orphanRemoval = true, mappedBy = "${rel.mappedBy}")\n`;
            } else {
                code += `    @${baseType}(cascade = CascadeType.ALL, orphanRemoval = true)\n`;
            }
        } else {
            // Para relaciones normales
            const relationType = rel.type.replace('-Composition', '');

            if (!rel.isOwner && rel.mappedBy) {
                // Lado no propietario
                code += `    @${relationType}(mappedBy = "${rel.mappedBy}")\n`;
                code += `    @JsonIgnore\n`;
            } else {
                // Lado propietario
                code += `    @${relationType}\n`;
            }
        }

        // Join Table para ManyToMany owner
        if (rel.type === 'ManyToMany' && rel.isOwner) {
            code += `    @JoinTable(\n`;
            code += `        name = "${this.generateJoinTableName(rel)}",\n`;
            code += `        joinColumns = @JoinColumn(name = "${this.sanitizeName(rel.fieldName)}_id"),\n`;
            code += `        inverseJoinColumns = @JoinColumn(name = "${rel.targetClass.toLowerCase()}_id")\n`;
            code += `    )\n`;
        }

        // JoinColumn para ManyToOne o OneToOne owner
        if ((rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) && rel.isOwner) {
            code += `    @JoinColumn(name = "${rel.fieldName}_id")\n`;
        }

        code += `    private ${fieldType} ${rel.fieldName};\n\n`;

        return code;
    }

    /**
     * Genera el nombre de la tabla intermedia para ManyToMany
     */
    private generateJoinTableName(rel: RelationMetadata): string {
        return `${rel.fieldName}_${rel.targetClass.toLowerCase()}`;
    }

    /**
     * Mapea tipos UML a tipos Java
     */
    private mapType(type: string): string {
        return this.javaTypeMapping[type] || type;
    }

    /**
     * Mapea visibilidad UML a Java
     */
    private mapVisibility(visibility: string): string {
        const map = {
            public: 'public',
            private: 'private',
            protected: 'protected',
            package: '',
        };
        return map[visibility] || 'public';
    }

    /**
     * Genera un Repository
     */
    private generateRepository(umlClass: UMLClass, basePackage: string, projectName: string, relationMetadata: Map<string, RelationMetadata[]>): string {
        const className = umlClass.name;
        const relations = relationMetadata.get(umlClass.id) || [];

        let code = `package ${basePackage}.${projectName}.repository;\n\n`;
        code += `import ${basePackage}.${projectName}.entity.${className};\n`;
        code += `import org.springframework.data.jpa.repository.JpaRepository;\n`;
        code += `import org.springframework.data.jpa.repository.Query;\n`;
        code += `import org.springframework.stereotype.Repository;\n`;
        code += `import java.util.List;\n\n`;
        code += `@Repository\n`;
        code += `public interface ${className}Repository extends JpaRepository<${className}, Long> {\n`;

        // ✅ Generar consulta JOIN FETCH basada en relaciones reales
        const fetchRelations = relations.filter(rel =>
            rel.type === 'OneToMany' || rel.type === 'ManyToOne' || rel.type === 'OneToOne'
        );

        if (fetchRelations.length > 0) {
            // Usar alias con primera letra minúscula de la clase
            const alias = className.charAt(0).toLowerCase();
            let query = `SELECT DISTINCT ${alias} FROM ${className} ${alias}`;

            // Agregar LEFT JOIN FETCH para cada relación
            fetchRelations.forEach(rel => {
                query += ` LEFT JOIN FETCH ${alias}.${rel.fieldName}`;
            });

            code += `    @Query("${query}")\n`;
            code += `    List<${className}> findAllWithDetails();\n`;
        }

        code += `}\n`;

        return code;
    }

    /**
     * Genera un Service
     */
    private generateService(umlClass: UMLClass, basePackage: string, projectName: string, relationMetadata: Map<string, RelationMetadata[]>): string {
        const className = umlClass.name;
        const dtoName = `${className}DTO`;
        const repositoryName = `${className}Repository`;
        const mapperName = `${className}Mapper`;
        const relations = relationMetadata.get(umlClass.id) || [];

        let code = `package ${basePackage}.${projectName}.service;\n\n`;
        code += `import ${basePackage}.${projectName}.entity.${className};\n`;
        code += `import ${basePackage}.${projectName}.dto.${dtoName};\n`;
        code += `import ${basePackage}.${projectName}.repository.${repositoryName};\n`;
        code += `import ${basePackage}.${projectName}.mapper.${mapperName};\n`;

        // Imports de otros repositorios si hay relaciones
        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                code += `import ${basePackage}.${projectName}.repository.${rel.targetClass}Repository;\n`;
                code += `import ${basePackage}.${projectName}.entity.${rel.targetClass};\n`;
            }
        });

        code += `import org.springframework.beans.factory.annotation.Autowired;\n`;
        code += `import org.springframework.stereotype.Service;\n`;
        code += `import java.util.List;\n`;
        code += `import java.util.Optional;\n\n`;
        code += `@Service\n`;
        code += `public class ${className}Service {\n\n`;
        code += `    @Autowired\n`;
        code += `    private ${repositoryName} repository;\n\n`;
        code += `    @Autowired\n`;
        code += `    private ${mapperName} mapper;\n\n`;

        // Inyectar repositorios de relaciones
        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                code += `    @Autowired\n`;
                code += `    private ${rel.targetClass}Repository ${rel.targetClass.charAt(0).toLowerCase()}${rel.targetClass.slice(1)}Repository;\n\n`;
            }
        });

        // CRUD básico
        code += `    public List<${className}> findAll() {\n`;
        code += `        return repository.findAllWithDetails();\n`;
        code += `    }\n\n`;

        code += `    public Optional<${className}> findById(Long id) {\n`;
        code += `        return repository.findById(id);\n`;
        code += `    }\n\n`;

        code += `    public ${className} save(${className} entity) {\n`;
        code += `        return repository.save(entity);\n`;
        code += `    }\n\n`;

        code += `    public void deleteById(Long id) {\n`;
        code += `        repository.deleteById(id);\n`;
        code += `    }\n\n`;

        // Método saveFromDTO con resolución de relaciones
        code += `    // ✅ Procesa DTO y resuelve relaciones buscando en BD\n`;
        code += `    public ${className} saveFromDTO(${dtoName} ${className.charAt(0).toLowerCase()}DTO) {\n`;
        code += `        ${className} ${className.charAt(0).toLowerCase()} = mapper.toEntity(${className.charAt(0).toLowerCase()}DTO);\n\n`;

        // Asignar relaciones propietarias
        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                const fieldId = `${rel.fieldName}Id`;
                const repoVar = `${rel.targetClass.charAt(0).toLowerCase()}${rel.targetClass.slice(1)}Repository`;
                const setterName = this.capitalize(rel.fieldName);

                code += `        // Buscar y asignar ${rel.targetClass}\n`;
                code += `        if (${className.charAt(0).toLowerCase()}DTO.get${this.capitalize(fieldId)}() != null) {\n`;
                code += `            Optional<${rel.targetClass}> ${rel.targetClass.charAt(0).toLowerCase()}Optional = ${repoVar}.findById(${className.charAt(0).toLowerCase()}DTO.get${this.capitalize(fieldId)}());\n`;
                code += `            if (${rel.targetClass.charAt(0).toLowerCase()}Optional.isPresent()) {\n`;
                code += `                ${className.charAt(0).toLowerCase()}.set${setterName}(${rel.targetClass.charAt(0).toLowerCase()}Optional.get());\n`;
                code += `            }\n`;
                code += `        }\n\n`;
            }
        });

        code += `        return repository.save(${className.charAt(0).toLowerCase()});\n`;
        code += `    }\n`;

        code += `}\n`;

        return code;
    }

    /**
     * Genera un Controller REST
     */
    // ...existing code...

    /**
     * Genera un Controller REST
     */
    private generateController(umlClass: UMLClass, basePackage: string, projectName: string): string {
        const className = umlClass.name;
        const dtoName = `${className}DTO`;
        const mapperName = `${className}Mapper`;
        const entityVar = className.charAt(0).toLowerCase() + className.slice(1);

        let code = `package ${basePackage}.${projectName}.controller;\n\n`;
        code += `import ${basePackage}.${projectName}.entity.${className};\n`;
        code += `import ${basePackage}.${projectName}.dto.${dtoName};\n`;
        code += `import ${basePackage}.${projectName}.service.${className}Service;\n`;
        code += `import ${basePackage}.${projectName}.mapper.${mapperName};\n`;
        code += `import org.springframework.beans.factory.annotation.Autowired;\n`;
        code += `import org.springframework.http.ResponseEntity;\n`;
        code += `import org.springframework.web.bind.annotation.*;\n`;
        code += `import java.util.List;\n`;
        code += `import java.util.stream.Collectors;\n\n`;
        code += `@RestController\n`;
        code += `@RequestMapping("/api/${entityVar}s")\n`;
        code += `@CrossOrigin(origins = "*")\n`;
        code += `public class ${className}Controller {\n\n`;
        code += `    @Autowired\n`;
        code += `    private ${className}Service service;\n\n`;
        code += `    @Autowired\n`;
        code += `    private ${mapperName} mapper;\n\n`;

        // GET all
        code += `    @GetMapping\n`;
        code += `    public List<${dtoName}> getAll() {\n`;
        code += `        return service.findAll()\n`;
        code += `            .stream()\n`;
        code += `            .map(mapper::toDTO)\n`;
        code += `            .collect(Collectors.toList());\n`;
        code += `    }\n\n`;

        // GET by id
        code += `    @GetMapping("/{id}")\n`;
        code += `    public ResponseEntity<${dtoName}> getById(@PathVariable Long id) {\n`;
        code += `        return service.findById(id)\n`;
        code += `            .map(mapper::toDTO)\n`;
        code += `            .map(ResponseEntity::ok)\n`;
        code += `            .orElse(ResponseEntity.notFound().build());\n`;
        code += `    }\n\n`;

        // POST
        code += `    @PostMapping\n`;
        code += `    public ${dtoName} create(@RequestBody ${dtoName} ${entityVar}DTO) {\n`;
        code += `        ${className} saved = service.saveFromDTO(${entityVar}DTO);\n`;
        code += `        return mapper.toDTO(saved);\n`;
        code += `    }\n\n`;

        // PUT
        code += `    @PutMapping("/{id}")\n`;
        code += `    public ResponseEntity<${dtoName}> update(@PathVariable Long id, @RequestBody ${dtoName} ${entityVar}DTO) {\n`;
        code += `        if (!service.findById(id).isPresent()) {\n`;
        code += `            return ResponseEntity.notFound().build();\n`;
        code += `        }\n`;
        code += `        ${className} updated = service.saveFromDTO(${entityVar}DTO);\n`;
        code += `        return ResponseEntity.ok(mapper.toDTO(updated));\n`;
        code += `    }\n\n`;

        // DELETE
        code += `    @DeleteMapping("/{id}")\n`;
        code += `    public ResponseEntity<Void> delete(@PathVariable Long id) {\n`;
        code += `        if (!service.findById(id).isPresent()) {\n`;
        code += `            return ResponseEntity.notFound().build();\n`;
        code += `        }\n`;
        code += `        service.deleteById(id);\n`;
        code += `        return ResponseEntity.noContent().build();\n`;
        code += `    }\n`;

        code += `}\n`;

        return code;
    }

    // ...existing code...

    /**
     * Genera README.md con instrucciones de uso y endpoints para Postman
     */
    private async generateReadmeWithEndpoints(exportPath: string, projectName: string, basePackage: string, diagram: UMLDiagram) {
        const port = '8080';
        const baseUrl = `http://localhost:${port}`;
        
        let readme = `# ${projectName} - API REST\n\n`;
        readme += `## Descripción\n\n`;
        readme += `Proyecto Spring Boot generado automáticamente desde diagrama UML.\n\n`;
        readme += `**Paquete base:** \`${basePackage}.${projectName}\`\n\n`;
        
        readme += `## Requisitos\n\n`;
        readme += `- Java 17 o superior\n`;
        readme += `- Maven 3.6+\n`;
        readme += `- MySQL 8.0+ (o la base de datos configurada)\n\n`;
        
        readme += `## Configuración\n\n`;
        readme += `1. Edita \`src/main/resources/application.properties\` con tu configuración de base de datos:\n\n`;
        readme += `\`\`\`properties\n`;
        readme += `spring.datasource.url=jdbc:mysql://localhost:3306/tu_base_datos\n`;
        readme += `spring.datasource.username=tu_usuario\n`;
        readme += `spring.datasource.password=tu_contraseña\n`;
        readme += `\`\`\`\n\n`;
        
        readme += `## Instalación y Ejecución\n\n`;
        readme += `\`\`\`bash\n`;
        readme += `# Compilar el proyecto\n`;
        readme += `mvn clean install\n\n`;
        readme += `# Ejecutar la aplicación\n`;
        readme += `mvn spring-boot:run\n`;
        readme += `\`\`\`\n\n`;
        readme += `La aplicación estará disponible en: **${baseUrl}**\n\n`;
        
        readme += `---\n\n`;
        readme += `## 📋 Endpoints de la API\n\n`;
        readme += `### Base URL: \`${baseUrl}\`\n\n`;
        
        // Generar endpoints para cada clase
        for (const umlClass of diagram.classes) {
            const entityName = umlClass.name;
            const entityNameLower = entityName.toLowerCase();
            const entityNamePlural = entityNameLower + 's'; // Simplificado, puedes mejorar la pluralización
            
            readme += `\n### 📦 ${entityName}\n\n`;
            
            // Atributos de ejemplo
            const exampleAttributes = umlClass.attributes
                .filter(attr => attr.name !== 'id')
                .reduce((obj, attr) => {
                    obj[attr.name] = this.getExampleValue(attr.type);
                    return obj;
                }, {} as any);
            
            // GET ALL
            readme += `#### 1. Obtener todos los ${entityNamePlural}\n`;
            readme += `\`\`\`http\n`;
            readme += `GET ${baseUrl}/api/${entityNameLower}\n`;
            readme += `\`\`\`\n\n`;
            readme += `**Respuesta exitosa (200 OK):**\n`;
            readme += `\`\`\`json\n`;
            readme += `[\n`;
            readme += `  {\n`;
            readme += `    "id": 1,\n`;
            Object.keys(exampleAttributes).forEach(key => {
                readme += `    "${key}": ${JSON.stringify(exampleAttributes[key])},\n`;
            });
            readme = readme.slice(0, -2) + '\n'; // Remover última coma
            readme += `  }\n`;
            readme += `]\n`;
            readme += `\`\`\`\n\n`;
            
            // GET BY ID
            readme += `#### 2. Obtener ${entityName} por ID\n`;
            readme += `\`\`\`http\n`;
            readme += `GET ${baseUrl}/api/${entityNameLower}/1\n`;
            readme += `\`\`\`\n\n`;
            readme += `**Respuesta exitosa (200 OK):**\n`;
            readme += `\`\`\`json\n`;
            readme += `{\n`;
            readme += `  "id": 1,\n`;
            Object.keys(exampleAttributes).forEach(key => {
                readme += `  "${key}": ${JSON.stringify(exampleAttributes[key])},\n`;
            });
            readme = readme.slice(0, -2) + '\n'; // Remover última coma
            readme += `}\n`;
            readme += `\`\`\`\n\n`;
            
            // POST (Crear)
            readme += `#### 3. Crear nuevo ${entityName}\n`;
            readme += `\`\`\`http\n`;
            readme += `POST ${baseUrl}/api/${entityNameLower}\n`;
            readme += `Content-Type: application/json\n\n`;
            readme += `{\n`;
            Object.keys(exampleAttributes).forEach(key => {
                readme += `  "${key}": ${JSON.stringify(exampleAttributes[key])},\n`;
            });
            readme = readme.slice(0, -2) + '\n'; // Remover última coma
            readme += `}\n`;
            readme += `\`\`\`\n\n`;
            readme += `**Respuesta exitosa (201 Created):**\n`;
            readme += `\`\`\`json\n`;
            readme += `{\n`;
            readme += `  "id": 2,\n`;
            Object.keys(exampleAttributes).forEach(key => {
                readme += `  "${key}": ${JSON.stringify(exampleAttributes[key])},\n`;
            });
            readme = readme.slice(0, -2) + '\n'; // Remover última coma
            readme += `}\n`;
            readme += `\`\`\`\n\n`;
            
            // PUT (Actualizar)
            readme += `#### 4. Actualizar ${entityName}\n`;
            readme += `\`\`\`http\n`;
            readme += `PUT ${baseUrl}/api/${entityNameLower}/1\n`;
            readme += `Content-Type: application/json\n\n`;
            readme += `{\n`;
            Object.keys(exampleAttributes).forEach(key => {
                readme += `  "${key}": ${JSON.stringify(exampleAttributes[key])},\n`;
            });
            readme = readme.slice(0, -2) + '\n'; // Remover última coma
            readme += `}\n`;
            readme += `\`\`\`\n\n`;
            readme += `**Respuesta exitosa (200 OK):**\n`;
            readme += `\`\`\`json\n`;
            readme += `{\n`;
            readme += `  "id": 1,\n`;
            Object.keys(exampleAttributes).forEach(key => {
                readme += `  "${key}": ${JSON.stringify(exampleAttributes[key])},\n`;
            });
            readme = readme.slice(0, -2) + '\n'; // Remover última coma
            readme += `}\n`;
            readme += `\`\`\`\n\n`;
            
            // DELETE
            readme += `#### 5. Eliminar ${entityName}\n`;
            readme += `\`\`\`http\n`;
            readme += `DELETE ${baseUrl}/api/${entityNameLower}/1\n`;
            readme += `\`\`\`\n\n`;
            readme += `**Respuesta exitosa (204 No Content)**\n\n`;
            
            readme += `---\n\n`;
        }
        
        readme += `## 🚀 Importar a Postman\n\n`;
        readme += `Para importar estos endpoints a Postman:\n\n`;
        readme += `1. Abre Postman\n`;
        readme += `2. Click en "Import"\n`;
        readme += `3. Copia y pega los endpoints en formato HTTP\n`;
        readme += `4. O crea una nueva colección manualmente con los endpoints listados arriba\n\n`;
        
        readme += `## 📝 Notas\n\n`;
        readme += `- Todos los endpoints retornan JSON\n`;
        readme += `- Los IDs son autogenerados\n`;
        readme += `- Verifica las relaciones entre entidades en el código generado\n`;
        readme += `- Revisa los DTOs para la estructura exacta de los objetos\n\n`;
        
        readme += `## 🛠️ Tecnologías\n\n`;
        readme += `- Spring Boot 3.x\n`;
        readme += `- Spring Data JPA\n`;
        readme += `- Spring Web\n`;
        readme += `- Lombok\n`;
        readme += `- MySQL Driver\n\n`;
        
        readme += `---\n`;
        readme += `**Generado automáticamente desde diagrama UML**\n`;
        
        await this.writeFile(path.join(exportPath, 'README.md'), readme);
    }
    
    /**
     * Retorna un valor de ejemplo basado en el tipo
     */
    private getExampleValue(type: string): any {
        const typeMap: { [key: string]: any } = {
            'String': 'ejemplo',
            'string': 'ejemplo',
            'Integer': 100,
            'int': 100,
            'Long': 1000,
            'long': 1000,
            'Double': 99.99,
            'double': 99.99,
            'Float': 9.99,
            'float': 9.99,
            'Boolean': true,
            'boolean': true,
            'Date': '2024-01-01',
            'LocalDate': '2024-01-01',
            'LocalDateTime': '2024-01-01T10:00:00',
            'BigDecimal': 99.99,
        };
        
        return typeMap[type] || 'valor';
    }

    /**
     * Genera los archivos de configuración del proyecto
     */
    private async generateConfigFiles(exportPath: string, projectName: string, basePackage: string) {
        await this.springbootStructureService.generateConfigFiles(exportPath, projectName, basePackage);
    }
    private async createProjectStructure(basePath: string, projectName: string, basePackage: string) {
        await this.springbootStructureService.createProjectStructure(basePath, projectName, basePackage);
    }
    private async writeFile(filePath: string, content: string) {
        await this.springbootStructureService.writeFile(filePath, content);
    }
    private async zipProject(projectPath: string, projectName: string): Promise<string> {
        return await this.springbootStructureService.zipProject(projectPath, projectName);
    }
    /**
     * Sanitiza nombres para usar en archivos y paquetes
     */
    private sanitizeName(name: string): string {
        return this.springbootStructureService.sanitizeName(name);
    }
    /**
     * Capitaliza la primera letra
     */
    private capitalize(str: string): string {
        return this.springbootStructureService.capitalize(str);
    }
}
