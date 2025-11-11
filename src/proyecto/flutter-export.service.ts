import { Injectable } from '@nestjs/common';
import { UMLDiagram, UMLClass, UMLAttribute, RelationMetadata, TransactionalMetadata } from './interfaces/uml.interface';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FlutterExportService {
    private dartTypeMapping: { [key: string]: string } = {
        'string': 'String',
        'String': 'String',
        'int': 'int',
        'Integer': 'int',
        'long': 'int',
        'Long': 'int',
        'double': 'double',
        'Double': 'double',
        'float': 'double',
        'Float': 'double',
        'boolean': 'bool',
        'Boolean': 'bool',
        'Date': 'DateTime',
        'LocalDate': 'DateTime',
        'LocalDateTime': 'DateTime',
        'BigDecimal': 'double',
    };

    /**
     * Exporta un diagrama UML a un proyecto Flutter
     */
    async exportToFlutter(
        diagram: UMLDiagram,
        projectName: string,
        baseUrl: string,
        relationMetadata: Map<string, RelationMetadata[]>,
        transactionalClasses?: Map<string, TransactionalMetadata>
    ): Promise<string> {
        const sanitizedProjectName = this.sanitizeName(projectName);
        const exportPath = path.join(process.cwd(), 'exportar', `${sanitizedProjectName}_flutter`);

        // Limpiar directorio anterior
        try {
            await fs.promises.rm(exportPath, { recursive: true, force: true });
        } catch (error) {
            // Ignorar si no existe
        }

        // Crear estructura de directorios Flutter
        await this.createFlutterStructure(exportPath);

        // Generar archivos
        await this.generatePubspec(exportPath, sanitizedProjectName);
        await this.generateApiConfig(exportPath, baseUrl);

        // Generar modelos y servicios para cada clase (incluye clases de asociación)
        for (const umlClass of diagram.classes) {
            const modelCode = this.generateDartModel(umlClass, relationMetadata, transactionalClasses || null, diagram);
            await this.writeFile(
                path.join(exportPath, 'lib', 'models', `${this.toSnakeCase(umlClass.name)}.dart`),
                modelCode
            );

            // Generar servicio API para cada clase
            const isTransactional = transactionalClasses ? transactionalClasses.has(umlClass.id) : false;
            const serviceCode = this.generateApiService(umlClass, sanitizedProjectName, isTransactional);
            await this.writeFile(
                path.join(exportPath, 'lib', 'services', `${this.toSnakeCase(umlClass.name)}_service.dart`),
                serviceCode
            );
        }

        // Generar DTOs transaccionales
        if (transactionalClasses) {
            for (const [classId, transactional] of transactionalClasses.entries()) {
                const transactionClass = diagram.classes.find(c => c.id === classId);
                const masterClass = diagram.classes.find(c => c.id === transactional.masterClassId);
                const detailClass = diagram.classes.find(c => c.name === transactional.detailClassName);

                if (transactionClass && masterClass && detailClass) {
                    const itemDtoCode = this.generateTransactionalItemDto(transactionClass, detailClass);
                    await this.writeFile(
                        path.join(exportPath, 'lib', 'models', `${this.toSnakeCase(transactionClass.name)}_${this.toSnakeCase(detailClass.name)}_item.dart`),
                        itemDtoCode
                    );
                }
            }
        }

        // Generar screens para cada entidad (incluye clases de asociación)
        for (const umlClass of diagram.classes) {
            const listScreenCode = this.generateListScreen(umlClass);
            await this.writeFile(
                path.join(exportPath, 'lib', 'screens', `${this.toSnakeCase(umlClass.name)}_list_screen.dart`),
                listScreenCode
            );

            const detailScreenCode = this.generateDetailScreen(umlClass, relationMetadata, diagram);
            await this.writeFile(
                path.join(exportPath, 'lib', 'screens', `${this.toSnakeCase(umlClass.name)}_detail_screen.dart`),
                detailScreenCode
            );

            const formScreenCode = this.generateFormScreen(umlClass, relationMetadata, diagram);
            await this.writeFile(
                path.join(exportPath, 'lib', 'screens', `${this.toSnakeCase(umlClass.name)}_form_screen.dart`),
                formScreenCode
            );
        }

        // Generar main.dart con menú de navegación
        await this.generateMainDart(exportPath, sanitizedProjectName, diagram.classes);

        return exportPath;
    }

    /**
     * Crea la estructura de directorios de Flutter
     */
    private async createFlutterStructure(basePath: string) {
        const dirs = [
            'lib',
            'lib/models',
            'lib/services',
            'lib/config',
            'lib/screens',
            'lib/widgets',
            'test',
            'assets',
        ];

        for (const dir of dirs) {
            await fs.promises.mkdir(path.join(basePath, dir), { recursive: true });
        }
    }

    /**
     * Genera el archivo pubspec.yaml
     */
    private async generatePubspec(basePath: string, projectName: string) {
        const content = `name: ${projectName}
description: Flutter app generated from UML diagram
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  http: ^1.1.0
  provider: ^6.1.1
  shared_preferences: ^2.2.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
`;

        await this.writeFile(path.join(basePath, 'pubspec.yaml'), content);
    }

    /**
     * Genera la configuración de API
     */
    private async generateApiConfig(basePath: string, baseUrl: string) {
        const content = `class ApiConfig {
  static const String baseUrl = '${baseUrl}';
  static const int timeoutSeconds = 30;
  
  static Map<String, String> get headers => {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}
`;

        await this.writeFile(path.join(basePath, 'lib', 'config', 'api_config.dart'), content);
    }

    /**
     * Genera un modelo Dart desde una clase UML
     */
    private generateDartModel(
        umlClass: UMLClass,
        relationMetadata: Map<string, RelationMetadata[]>,
        transactionalClasses: Map<string, TransactionalMetadata> | null,
        diagram: UMLDiagram
    ): string {
        const className = umlClass.name;
        const filteredAttributes = this.filterAttributesStrict(umlClass.attributes, className);
        const relations = relationMetadata.get(umlClass.id) || [];

        // ✅ NUEVO: Detectar si esta clase es maestro en una relación transaccional
        let transactionalItemModel: string | null = null;
        if (transactionalClasses) {
            for (const [classId, transactional] of transactionalClasses.entries()) {
                if (transactional.masterClassId === umlClass.id) {
                    const transactionClass = diagram.classes.find(c => c.id === classId);
                    const detailClass = diagram.classes.find(c => c.name === transactional.detailClassName);

                    if (transactionClass && detailClass) {
                        transactionalItemModel = `${transactionClass.name}${detailClass.name}Item`;
                        break;
                    }
                }
            }
        }

        // ✅ NUEVO: Agregar imports necesarios
        let code = ``;
        if (transactionalItemModel) {
            code += `import '${this.toSnakeCase(transactionalItemModel)}.dart';\n\n`;
        }

        code += `class ${className} {\n`;

        // Atributos
        code += `  int? id;\n`;

        filteredAttributes.forEach(attr => {
            const dartType = this.mapType(attr.type);
            code += `  ${dartType}? ${attr.name};\n`;
        });

        // Foreign Keys
        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                code += `  int? ${rel.fieldName}Id;\n`;
            }
        });

        // ✅ Si es transaccional, agregar lista de detalles
        if (transactionalItemModel) {
            code += `  List<${transactionalItemModel}>? detalles;\n`;
        }

        code += `\n`;

        // Constructor
        code += `  ${className}({\n`;
        code += `    this.id,\n`;

        filteredAttributes.forEach(attr => {
            code += `    this.${attr.name},\n`;
        });

        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                code += `    this.${rel.fieldName}Id,\n`;
            }
        });

        // Detalles si es transaccional
        if (transactionalItemModel) {
            code += `    this.detalles,\n`;
        }

        code += `  });\n\n`;

        // fromJson
        code += `  factory ${className}.fromJson(Map<String, dynamic> json) {\n`;
        code += `    return ${className}(\n`;
        code += `      id: json['id'] as int?,\n`;

        filteredAttributes.forEach(attr => {
            const dartType = this.mapType(attr.type);
            if (dartType === 'DateTime') {
                code += `      ${attr.name}: json['${attr.name}'] != null ? DateTime.parse(json['${attr.name}']) : null,\n`;
            } else {
                code += `      ${attr.name}: json['${attr.name}'] as ${dartType}?,\n`;
            }
        });

        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                code += `      ${rel.fieldName}Id: json['${rel.fieldName}Id'] as int?,\n`;
            }
        });

        // Detalles si es transaccional
        if (transactionalItemModel) {
            code += `      detalles: json['detalles'] != null\n`;
            code += `          ? (json['detalles'] as List).map((e) => ${transactionalItemModel}.fromJson(e)).toList()\n`;
            code += `          : null,\n`;
        }

        code += `    );\n`;
        code += `  }\n\n`;

        // toJson
        code += `  Map<String, dynamic> toJson() {\n`;
        code += `    return {\n`;
        code += `      'id': id,\n`;

        filteredAttributes.forEach(attr => {
            const dartType = this.mapType(attr.type);
            if (dartType === 'DateTime') {
                code += `      '${attr.name}': ${attr.name}?.toIso8601String(),\n`;
            } else {
                code += `      '${attr.name}': ${attr.name},\n`;
            }
        });

        relations.forEach(rel => {
            if (rel.type === 'ManyToOne' || (rel.type === 'OneToOne' && rel.isOwner)) {
                code += `      '${rel.fieldName}Id': ${rel.fieldName}Id,\n`;
            }
        });

        // Detalles si es transaccional
        if (transactionalItemModel) {
            code += `      'detalles': detalles?.map((e) => e.toJson()).toList(),\n`;
        }

        code += `    };\n`;
        code += `  }\n`;

        // ✅ NUEVO: Agregar método toString() para los dropdowns
        code += `\n  @override\n`;
        code += `  String toString() {\n`;
        code += `    return 'ID: \$id';\n`;
        code += `  }\n`;

        code += `}\n`;


        return code;
    }
    /**
     * Genera DTO transaccional para Flutter
     */
    private generateTransactionalItemDto(transactionClass: UMLClass, detailClass: UMLClass): string {
        const transactionName = transactionClass.name;
        const detailName = detailClass.name;
        const itemClassName = `${transactionName}${detailName}Item`;
        const filteredAttributes = this.filterAttributesStrict(transactionClass.attributes, transactionName);

        let code = `class ${itemClassName} {\n`;

        filteredAttributes.forEach(attr => {
            const dartType = this.mapType(attr.type);
            code += `  ${dartType}? ${attr.name};\n`;
        });

        code += `  int? ${detailName.charAt(0).toLowerCase()}${detailName.slice(1)}Id;\n\n`;

        // Constructor
        code += `  ${itemClassName}({\n`;
        filteredAttributes.forEach(attr => {
            code += `    this.${attr.name},\n`;
        });
        code += `    this.${detailName.charAt(0).toLowerCase()}${detailName.slice(1)}Id,\n`;
        code += `  });\n\n`;

        // fromJson
        code += `  factory ${itemClassName}.fromJson(Map<String, dynamic> json) {\n`;
        code += `    return ${itemClassName}(\n`;
        filteredAttributes.forEach(attr => {
            const dartType = this.mapType(attr.type);
            if (dartType === 'DateTime') {
                code += `      ${attr.name}: json['${attr.name}'] != null ? DateTime.parse(json['${attr.name}']) : null,\n`;
            } else {
                code += `      ${attr.name}: json['${attr.name}'] as ${dartType}?,\n`;
            }
        });
        code += `      ${detailName.charAt(0).toLowerCase()}${detailName.slice(1)}Id: json['${detailName.charAt(0).toLowerCase()}${detailName.slice(1)}Id'] as int?,\n`;
        code += `    );\n`;
        code += `  }\n\n`;

        // toJson
        code += `  Map<String, dynamic> toJson() {\n`;
        code += `    return {\n`;
        filteredAttributes.forEach(attr => {
            const dartType = this.mapType(attr.type);
            if (dartType === 'DateTime') {
                code += `      '${attr.name}': ${attr.name}?.toIso8601String(),\n`;
            } else {
                code += `      '${attr.name}': ${attr.name},\n`;
            }
        });
        code += `      '${detailName.charAt(0).toLowerCase()}${detailName.slice(1)}Id': ${detailName.charAt(0).toLowerCase()}${detailName.slice(1)}Id,\n`;
        code += `    };\n`;
        code += `  }\n`;
        code += `}\n`;

        return code;
    }

    /**
     * Genera un servicio API para una entidad
     */
    private generateApiService(umlClass: UMLClass, projectName: string, isTransactional: boolean): string {
        const className = umlClass.name;
        const varName = className.charAt(0).toLowerCase() + className.slice(1);
        const endpoint = `${varName}s`;

        let code = `import 'dart:convert';\n`;
        code += `import 'package:http/http.dart' as http;\n`;
        code += `import '../config/api_config.dart';\n`;
        code += `import '../models/${this.toSnakeCase(className)}.dart';\n\n`;

        code += `class ${className}Service {\n`;
        code += `  Future<List<${className}>> getAll() async {\n`;
        code += `    final response = await http.get(\n`;
        code += `      Uri.parse('\${ApiConfig.baseUrl}/api/${endpoint}'),\n`;
        code += `      headers: ApiConfig.headers,\n`;
        code += `    ).timeout(Duration(seconds: ApiConfig.timeoutSeconds));\n\n`;
        code += `    if (response.statusCode == 200) {\n`;
        code += `      List<dynamic> body = jsonDecode(response.body);\n`;
        code += `      return body.map((e) => ${className}.fromJson(e)).toList();\n`;
        code += `    } else {\n`;
        code += `      throw Exception('Failed to load ${varName}s');\n`;
        code += `    }\n`;
        code += `  }\n\n`;

        code += `  Future<${className}> getById(int id) async {\n`;
        code += `    final response = await http.get(\n`;
        code += `      Uri.parse('\${ApiConfig.baseUrl}/api/${endpoint}/\$id'),\n`;
        code += `      headers: ApiConfig.headers,\n`;
        code += `    ).timeout(Duration(seconds: ApiConfig.timeoutSeconds));\n\n`;
        code += `    if (response.statusCode == 200) {\n`;
        code += `      return ${className}.fromJson(jsonDecode(response.body));\n`;
        code += `    } else {\n`;
        code += `      throw Exception('Failed to load ${varName}');\n`;
        code += `    }\n`;
        code += `  }\n\n`;

        code += `  Future<${className}> create(${className} ${varName}) async {\n`;
        code += `    final response = await http.post(\n`;
        code += `      Uri.parse('\${ApiConfig.baseUrl}/api/${endpoint}'),\n`;
        code += `      headers: ApiConfig.headers,\n`;
        code += `      body: jsonEncode(${varName}.toJson()),\n`;
        code += `    ).timeout(Duration(seconds: ApiConfig.timeoutSeconds));\n\n`;
        code += `    if (response.statusCode == 200 || response.statusCode == 201) {\n`;
        code += `      return ${className}.fromJson(jsonDecode(response.body));\n`;
        code += `    } else {\n`;
        code += `      throw Exception('Failed to create ${varName}');\n`;
        code += `    }\n`;
        code += `  }\n\n`;

        code += `  Future<${className}> update(int id, ${className} ${varName}) async {\n`;
        code += `    final response = await http.put(\n`;
        code += `      Uri.parse('\${ApiConfig.baseUrl}/api/${endpoint}/\$id'),\n`;
        code += `      headers: ApiConfig.headers,\n`;
        code += `      body: jsonEncode(${varName}.toJson()),\n`;
        code += `    ).timeout(Duration(seconds: ApiConfig.timeoutSeconds));\n\n`;
        code += `    if (response.statusCode == 200) {\n`;
        code += `      return ${className}.fromJson(jsonDecode(response.body));\n`;
        code += `    } else {\n`;
        code += `      throw Exception('Failed to update ${varName}');\n`;
        code += `    }\n`;
        code += `  }\n\n`;

        code += `  Future<void> delete(int id) async {\n`;
        code += `    final response = await http.delete(\n`;
        code += `      Uri.parse('\${ApiConfig.baseUrl}/api/${endpoint}/\$id'),\n`;
        code += `      headers: ApiConfig.headers,\n`;
        code += `    ).timeout(Duration(seconds: ApiConfig.timeoutSeconds));\n\n`;
        code += `    if (response.statusCode != 204 && response.statusCode != 200) {\n`;
        code += `      throw Exception('Failed to delete ${varName}');\n`;
        code += `    }\n`;
        code += `  }\n`;

        code += `}\n`;

        return code;
    }

    /**
     * Genera el main.dart con menú de navegación
     */
    private async generateMainDart(basePath: string, projectName: string, classes: UMLClass[]) {
        // Filtrar clases válidas
        const validClasses = classes.filter(c => c.stereotype !== '<<association>>');

        // Generar imports
        let imports = `import 'package:flutter/material.dart';\n`;
        validClasses.forEach(umlClass => {
            const screenFileName = this.toSnakeCase(umlClass.name);
            imports += `import 'screens/${screenFileName}_list_screen.dart';\n`;
        });

        // Generar opciones de menú
        let menuOptions = '';
        validClasses.forEach(umlClass => {
            menuOptions += `      _MenuItem('${umlClass.name}s', ${umlClass.name}ListScreen()),\n`;
        });

        const content = `${imports}
void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${projectName}',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const MyHomePage(title: '${projectName}'),
    );
  }
}

class _MenuItem {
  final String name;
  final Widget screen;

  _MenuItem(this.name, this.screen);
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  final List<_MenuItem> menuItems = [
${menuOptions}  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: menuItems.isEmpty
          ? const Center(
              child: Text('No entities to display'),
            )
          : ListView.builder(
              itemCount: menuItems.length,
              itemBuilder: (context, index) {
                final item = menuItems[index];
                return Card(
                  margin: const EdgeInsets.all(8),
                  child: ListTile(
                    title: Text(item.name),
                    subtitle: const Text('Tap to view'),
                    trailing: const Icon(Icons.arrow_forward),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (context) => item.screen),
                      );
                    },
                  ),
                );
              },
            ),
    );
  }
}
`;

        await this.writeFile(path.join(basePath, 'lib', 'main.dart'), content);
    }

    /**
     * Genera la pantalla de lista para una entidad
     */
    private generateListScreen(umlClass: UMLClass): string {
        const className = umlClass.name;
        const varName = className.charAt(0).toLowerCase() + className.slice(1);
        const pluralName = `${varName}s`;
        const screenFileName = this.toSnakeCase(className);

        let code = `import 'package:flutter/material.dart';\n`;
        code += `import '../models/${screenFileName}.dart';\n`;
        code += `import '../services/${screenFileName}_service.dart';\n`;
        code += `import './${screenFileName}_form_screen.dart';\n`;
        code += `import './${screenFileName}_detail_screen.dart';\n\n`;

        code += `class ${className}ListScreen extends StatefulWidget {\n`;
        code += `  const ${className}ListScreen({super.key});\n\n`;
        code += `  @override\n`;
        code += `  State<${className}ListScreen> createState() => _${className}ListScreenState();\n`;
        code += `}\n\n`;

        code += `class _${className}ListScreenState extends State<${className}ListScreen> {\n`;
        code += `  final ${className}Service service = ${className}Service();\n`;
        code += `  late Future<List<${className}>> future${className}s;\n\n`;

        code += `  @override\n`;
        code += `  void initState() {\n`;
        code += `    super.initState();\n`;
        code += `    future${className}s = service.getAll();\n`;
        code += `  }\n\n`;

        code += `  void _refresh() {\n`;
        code += `    setState(() {\n`;
        code += `      future${className}s = service.getAll();\n`;
        code += `    });\n`;
        code += `  }\n\n`;

        code += `  void _goToDetail(int id) {\n`;
        code += `    Navigator.push(\n`;
        code += `      context,\n`;
        code += `      MaterialPageRoute(\n`;
        code += `        builder: (context) => ${className}DetailScreen(id: id),\n`;
        code += `      ),\n`;
        code += `    ).then((result) {\n`;
        code += `      if (result == true) _refresh();\n`;
        code += `    });\n`;
        code += `  }\n\n`;

        code += `  void _goToForm() {\n`;
        code += `    Navigator.push(\n`;
        code += `      context,\n`;
        code += `      MaterialPageRoute(\n`;
        code += `        builder: (context) => const ${className}FormScreen(),\n`;
        code += `      ),\n`;
        code += `    ).then((result) {\n`;
        code += `      if (result == true) _refresh();\n`;
        code += `    });\n`;
        code += `  }\n\n`;

        code += `  @override\n`;
        code += `  Widget build(BuildContext context) {\n`;
        code += `    return Scaffold(\n`;
        code += `      appBar: AppBar(\n`;
        code += `        title: const Text('${className} List'),\n`;
        code += `      ),\n`;
        code += `      body: FutureBuilder<List<${className}>>(\n`;
        code += `        future: future${className}s,\n`;
        code += `        builder: (context, snapshot) {\n`;
        code += `          if (snapshot.connectionState == ConnectionState.waiting) {\n`;
        code += `            return const Center(child: CircularProgressIndicator());\n`;
        code += `          } else if (snapshot.hasError) {\n`;
        code += `            return Center(child: Text('Error: \${snapshot.error}'));\n`;
        code += `          } else if (!snapshot.hasData || snapshot.data!.isEmpty) {\n`;
        code += `            return const Center(child: Text('No ${pluralName} found'));\n`;
        code += `          }\n\n`;
        code += `          return ListView.builder(\n`;
        code += `            itemCount: snapshot.data!.length,\n`;
        code += `            itemBuilder: (context, index) {\n`;
        code += `              final ${varName} = snapshot.data![index];\n`;
        code += `              return ListTile(\n`;
        code += `                title: Text('${className} #\${${varName}.id}'),\n`;
        code += `                onTap: () => _goToDetail(${varName}.id!),\n`;
        code += `              );\n`;
        code += `            },\n`;
        code += `          );\n`;
        code += `        },\n`;
        code += `      ),\n`;
        code += `      floatingActionButton: FloatingActionButton(\n`;
        code += `        onPressed: _goToForm,\n`;
        code += `        tooltip: 'Add ${className}',\n`;
        code += `        child: const Icon(Icons.add),\n`;
        code += `      ),\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n`;

        return code;
    }

    /**
     * Genera la pantalla de detalle para una entidad
     */
    private generateDetailScreen(umlClass: UMLClass, relationMetadata: Map<string, RelationMetadata[]>, diagram: UMLDiagram): string {
        const className = umlClass.name;
        const varName = className.charAt(0).toLowerCase() + className.slice(1);
        const screenFileName = this.toSnakeCase(className);
        const filteredAttributes = this.filterAttributesStrict(umlClass.attributes, className);

        let code = `import 'package:flutter/material.dart';\n`;
        code += `import '../models/${screenFileName}.dart';\n`;
        code += `import '../services/${screenFileName}_service.dart';\n`;
        code += `import './${screenFileName}_form_screen.dart';\n\n`;

        code += `class ${className}DetailScreen extends StatefulWidget {\n`;
        code += `  final int id;\n\n`;
        code += `  const ${className}DetailScreen({required this.id, super.key});\n\n`;
        code += `  @override\n`;
        code += `  State<${className}DetailScreen> createState() => _${className}DetailScreenState();\n`;
        code += `}\n\n`;

        code += `class _${className}DetailScreenState extends State<${className}DetailScreen> {\n`;
        code += `  final ${className}Service service = ${className}Service();\n`;
        code += `  late Future<${className}> future${className};\n\n`;

        code += `  @override\n`;
        code += `  void initState() {\n`;
        code += `    super.initState();\n`;
        code += `    future${className} = service.getById(widget.id);\n`;
        code += `  }\n\n`;

        code += `  void _goToEdit(${className} ${varName}) async {\n`;
        code += `    Navigator.push(\n`;
        code += `      context,\n`;
        code += `      MaterialPageRoute(\n`;
        code += `        builder: (context) => ${className}FormScreen(${varName}: ${varName}),\n`;
        code += `      ),\n`;
        code += `    ).then((result) {\n`;
        code += `      if (result == true) {\n`;
        code += `        setState(() {\n`;
        code += `          future${className} = service.getById(widget.id);\n`;
        code += `        });\n`;
        code += `      }\n`;
        code += `    });\n`;
        code += `  }\n\n`;

        code += `  void _delete() async {\n`;
        code += `    showDialog(\n`;
        code += `      context: context,\n`;
        code += `      builder: (context) => AlertDialog(\n`;
        code += `        title: const Text('Confirm Delete'),\n`;
        code += `        content: const Text('Are you sure you want to delete this ${varName}?'),\n`;
        code += `        actions: [\n`;
        code += `          TextButton(\n`;
        code += `            onPressed: () => Navigator.pop(context),\n`;
        code += `            child: const Text('Cancel'),\n`;
        code += `          ),\n`;
        code += `          TextButton(\n`;
        code += `            onPressed: () async {\n`;
        code += `              await service.delete(widget.id);\n`;
        code += `              Navigator.pop(context);\n`;
        code += `              Navigator.pop(context, true);\n`;
        code += `            },\n`;
        code += `            child: const Text('Delete'),\n`;
        code += `          ),\n`;
        code += `        ],\n`;
        code += `      ),\n`;
        code += `    );\n`;
        code += `  }\n\n`;

        code += `  @override\n`;
        code += `  Widget build(BuildContext context) {\n`;
        code += `    return Scaffold(\n`;
        code += `      appBar: AppBar(\n`;
        code += `        title: const Text('${className} Detail'),\n`;
        code += `        actions: [\n`;
        code += `          IconButton(\n`;
        code += `            icon: const Icon(Icons.edit),\n`;
        code += `            onPressed: () async {\n`;
        code += `              final ${varName} = await future${className};\n`;
        code += `              _goToEdit(${varName});\n`;
        code += `            },\n`;
        code += `          ),\n`;
        code += `          IconButton(\n`;
        code += `            icon: const Icon(Icons.delete),\n`;
        code += `            onPressed: _delete,\n`;
        code += `          ),\n`;
        code += `        ],\n`;
        code += `      ),\n`;
        code += `      body: FutureBuilder<${className}>(\n`;
        code += `        future: future${className},\n`;
        code += `        builder: (context, snapshot) {\n`;
        code += `          if (snapshot.connectionState == ConnectionState.waiting) {\n`;
        code += `            return const Center(child: CircularProgressIndicator());\n`;
        code += `          } else if (snapshot.hasError) {\n`;
        code += `            return Center(child: Text('Error: \${snapshot.error}'));\n`;
        code += `          } else if (!snapshot.hasData) {\n`;
        code += `            return const Center(child: Text('${className} not found'));\n`;
        code += `          }\n\n`;
        code += `          final ${varName} = snapshot.data!;\n`;
        code += `          return SingleChildScrollView(\n`;
        code += `            padding: const EdgeInsets.all(16),\n`;
        code += `            child: Column(\n`;
        code += `              crossAxisAlignment: CrossAxisAlignment.start,\n`;
        code += `              children: [\n`;

        // Mostrar atributos
        filteredAttributes.forEach(attr => {
            code += `                Card(\n`;
            code += `                  child: Padding(\n`;
            code += `                    padding: const EdgeInsets.all(8),\n`;
            code += `                    child: Column(\n`;
            code += `                      crossAxisAlignment: CrossAxisAlignment.start,\n`;
            code += `                      children: [\n`;
            code += `                        Text(\n`;
            code += `                          '${attr.name}',\n`;
            code += `                          style: const TextStyle(fontWeight: FontWeight.bold),\n`;
            code += `                        ),\n`;
            code += `                        Text('\${${varName}.${attr.name}}'),\n`;
            code += `                      ],\n`;
            code += `                    ),\n`;
            code += `                  ),\n`;
            code += `                ),\n`;
            code += `                const SizedBox(height: 8),\n`;
        });

        code += `              ],\n`;
        code += `            ),\n`;
        code += `          );\n`;
        code += `        },\n`;
        code += `      ),\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n`;

        return code;
    }

    /**
     * Genera la pantalla de formulario para una entidad
     */
    private generateFormScreen(umlClass: UMLClass, relationMetadata: Map<string, RelationMetadata[]>, diagram: UMLDiagram): string {
        const className = umlClass.name;
        const varName = className.charAt(0).toLowerCase() + className.slice(1);
        const screenFileName = this.toSnakeCase(className);
        const filteredAttributes = this.filterAttributesStrict(umlClass.attributes, className);

        // Detectar relaciones ManyToOne y OneToOne (donde esta clase es el owner)
        const foreignKeyRelations: Array<{
            fieldName: string;
            targetClass: string;
            type: string;
        }> = [];

        const relations = relationMetadata.get(umlClass.id) || [];
        relations.forEach(rel => {
            if ((rel.type === 'ManyToOne' || rel.type === 'OneToOne') && rel.isOwner) {
                foreignKeyRelations.push({
                    fieldName: rel.fieldName,
                    targetClass: rel.targetClass,
                    type: rel.type
                });
            }
        });

        let code = `import 'package:flutter/material.dart';\n`;
        code += `import '../models/${screenFileName}.dart';\n`;
        code += `import '../services/${screenFileName}_service.dart';\n`;

        // Importar servicios de las entidades relacionadas
        foreignKeyRelations.forEach(fk => {
            const fkScreenFileName = this.toSnakeCase(fk.targetClass);
            code += `import '../models/${fkScreenFileName}.dart';\n`;
            code += `import '../services/${fkScreenFileName}_service.dart';\n`;
        });

        code += `\n`;

        code += `class ${className}FormScreen extends StatefulWidget {\n`;
        code += `  final ${className}? ${varName};\n\n`;
        code += `  const ${className}FormScreen({this.${varName}, super.key});\n\n`;
        code += `  @override\n`;
        code += `  State<${className}FormScreen> createState() => _${className}FormScreenState();\n`;
        code += `}\n\n`;

        code += `class _${className}FormScreenState extends State<${className}FormScreen> {\n`;
        code += `  final ${className}Service service = ${className}Service();\n`;
        code += `  final _formKey = GlobalKey<FormState>();\n`;
        code += `  bool _isLoading = false;\n\n`;

        // Generar campos de texto
        filteredAttributes.forEach(attr => {
            code += `  late TextEditingController _${attr.name}Controller;\n`;
        });

        // Generar variables de estado para foreign keys
        foreignKeyRelations.forEach(fk => {
            code += `  int? _selected${fk.fieldName.charAt(0).toUpperCase() + fk.fieldName.slice(1)}Id;\n`;
        });

        code += `\n  @override\n`;
        code += `  void initState() {\n`;
        code += `    super.initState();\n`;

        // Inicializar text controllers
        filteredAttributes.forEach(attr => {
            code += `    _${attr.name}Controller = TextEditingController(\n`;
            code += `      text: widget.${varName}?.${attr.name}?.toString() ?? '',\n`;
            code += `    );\n`;
        });

        // Inicializar foreign keys si está en modo edición
        if (foreignKeyRelations.length > 0) {
            code += `\n    // Inicializar foreign keys si está en modo edición\n`;
            foreignKeyRelations.forEach(fk => {
                const fieldNameCapitalized = fk.fieldName.charAt(0).toUpperCase() + fk.fieldName.slice(1);
                code += `    _selected${fieldNameCapitalized}Id = widget.${varName}?.${fk.fieldName}Id;\n`;
            });
        }

        code += `  }\n\n`;

        code += `  @override\n`;
        code += `  void dispose() {\n`;
        filteredAttributes.forEach(attr => {
            code += `    _${attr.name}Controller.dispose();\n`;
        });
        code += `    super.dispose();\n`;
        code += `  }\n\n`;

        code += `  void _submit() async {\n`;
        code += `    if (!_formKey.currentState!.validate()) return;\n\n`;
        code += `    setState(() => _isLoading = true);\n`;
        code += `    try {\n`;
        code += `      final ${varName} = ${className}(\n`;
        code += `        id: widget.${varName}?.id, // Solo se establece si está en modo edición\n`;

        // Agregar atributos normales
        filteredAttributes.forEach(attr => {
            const dartType = this.mapType(attr.type);
            if (dartType === 'int') {
                code += `        ${attr.name}: int.tryParse(_${attr.name}Controller.text),\n`;
            } else if (dartType === 'double') {
                code += `        ${attr.name}: double.tryParse(_${attr.name}Controller.text),\n`;
            } else if (dartType === 'bool') {
                code += `        ${attr.name}: _${attr.name}Controller.text.toLowerCase() == 'true',\n`;
            } else if (dartType === 'DateTime') {
                code += `        ${attr.name}: DateTime.tryParse(_${attr.name}Controller.text),\n`;
            } else {
                code += `        ${attr.name}: _${attr.name}Controller.text,\n`;
            }
        });

        // Agregar foreign key IDs
        foreignKeyRelations.forEach(fk => {
            const fieldNameCapitalized = fk.fieldName.charAt(0).toUpperCase() + fk.fieldName.slice(1);
            code += `        ${fk.fieldName}Id: _selected${fieldNameCapitalized}Id,\n`;
        });

        code += `      );\n\n`;
        code += `      if (widget.${varName} == null) {\n`;
        code += `        await service.create(${varName});\n`;
        code += `      } else {\n`;
        code += `        await service.update(widget.${varName}!.id!, ${varName});\n`;
        code += `      }\n\n`;
        code += `      Navigator.pop(context, true);\n`;
        code += `    } catch (e) {\n`;
        code += `      ScaffoldMessenger.of(context).showSnackBar(\n`;
        code += `        SnackBar(content: Text('Error: \$e')),\n`;
        code += `      );\n`;
        code += `    } finally {\n`;
        code += `      setState(() => _isLoading = false);\n`;
        code += `    }\n`;
        code += `  }\n\n`;

        code += `  @override\n`;
        code += `  Widget build(BuildContext context) {\n`;
        code += `    return Scaffold(\n`;
        code += `      appBar: AppBar(\n`;
        code += `        title: Text(widget.${varName} == null ? 'New ${className}' : 'Edit ${className}'),\n`;
        code += `      ),\n`;
        code += `      body: SingleChildScrollView(\n`;
        code += `        padding: const EdgeInsets.all(16),\n`;
        code += `        child: Form(\n`;
        code += `          key: _formKey,\n`;
        code += `          child: Column(\n`;
        code += `            children: [\n`;

        // 🔒 Mostrar ID solo en modo edición (registros existentes)
        code += `              if (widget.${varName} != null)\n`;
        code += `                Card(\n`;
        code += `                  margin: const EdgeInsets.only(bottom: 16),\n`;
        code += `                  child: Padding(\n`;
        code += `                    padding: const EdgeInsets.all(8),\n`;
        code += `                    child: Row(\n`;
        code += `                      mainAxisAlignment: MainAxisAlignment.spaceBetween,\n`;
        code += `                      children: [\n`;
        code += `                        const Text(\n`;
        code += `                          'ID:',\n`;
        code += `                          style: TextStyle(fontWeight: FontWeight.bold),\n`;
        code += `                        ),\n`;
        code += `                        Text('\${widget.${varName}!.id}'),\n`;
        code += `                      ],\n`;
        code += `                    ),\n`;
        code += `                  ),\n`;
        code += `                ),\n`;
        code += `              const SizedBox(height: 8),\n`;
        code += `\n`;

        // Generar campos del formulario (atributos normales)
        filteredAttributes.forEach(attr => {
            code += `              TextFormField(\n`;
            code += `                controller: _${attr.name}Controller,\n`;
            code += `                decoration: InputDecoration(\n`;
            code += `                  labelText: '${attr.name}',\n`;
            code += `                  border: const OutlineInputBorder(),\n`;
            code += `                ),\n`;
            code += `                validator: (value) {\n`;
            code += `                  if (value?.isEmpty ?? true) return '${attr.name} is required';\n`;
            code += `                  return null;\n`;
            code += `                },\n`;
            code += `              ),\n`;
            code += `              const SizedBox(height: 16),\n`;
        });

        // Generar dropdowns para foreign keys
        foreignKeyRelations.forEach(fk => {
            const targetService = `${fk.targetClass}Service()`;
            const fieldNameCapitalized = fk.fieldName.charAt(0).toUpperCase() + fk.fieldName.slice(1);

            code += `              // Dropdown para ${fk.fieldName}\n`;
            code += `              FutureBuilder<List<${fk.targetClass}>>(\n`;
            code += `                future: ${targetService}.getAll(),\n`;
            code += `                builder: (context, snapshot) {\n`;
            code += `                  if (snapshot.connectionState == ConnectionState.waiting) {\n`;
            code += `                    return const CircularProgressIndicator();\n`;
            code += `                  }\n`;
            code += `                  if (snapshot.hasError) {\n`;
            code += `                    return Text('Error: \${snapshot.error}');\n`;
            code += `                  }\n`;
            code += `                  final items = snapshot.data ?? [];\n`;
            code += `                  return DropdownButtonFormField<int>(\n`;
            code += `                    value: _selected${fieldNameCapitalized}Id,\n`;
            code += `                    decoration: InputDecoration(\n`;
            code += `                      labelText: '${fk.fieldName}',\n`;
            code += `                      border: const OutlineInputBorder(),\n`;
            code += `                    ),\n`;
            code += `                    items: items.map((item) {\n`;
            code += `                      return DropdownMenuItem<int>(\n`;
            code += `                        value: item.id,\n`;
            code += `                        child: Text(item.toString()),\n`;
            code += `                      );\n`;
            code += `                    }).toList(),\n`;
            code += `                    onChanged: (value) {\n`;
            code += `                      setState(() {\n`;
            code += `                        _selected${fieldNameCapitalized}Id = value;\n`;
            code += `                      });\n`;
            code += `                    },\n`;
            code += `                    validator: (value) {\n`;
            code += `                      if (value == null) return '${fk.fieldName} is required';\n`;
            code += `                      return null;\n`;
            code += `                    },\n`;
            code += `                  );\n`;
            code += `                },\n`;
            code += `              ),\n`;
            code += `              const SizedBox(height: 16),\n`;
        });

        code += `              ElevatedButton(\n`;
        code += `                onPressed: _isLoading ? null : _submit,\n`;
        code += `                child: _isLoading\n`;
        code += `                    ? const SizedBox(\n`;
        code += `                        height: 20,\n`;
        code += `                        width: 20,\n`;
        code += `                        child: CircularProgressIndicator(),\n`;
        code += `                      )\n`;
        code += `                    : const Text('Save'),\n`;
        code += `              ),\n`;
        code += `            ],\n`;
        code += `          ),\n`;
        code += `        ),\n`;
        code += `      ),\n`;
        code += `    );\n`;
        code += `  }\n`;
        code += `}\n`;

        return code;
    }

    /**
     * Filtra atributos eliminando IDs y Foreign Keys
     */
    private filterAttributesStrict(attributes: UMLAttribute[], className: string): UMLAttribute[] {
        return attributes.filter(attr => {
            const lowerName = attr.name.toLowerCase();

            // Excluir cualquier atributo que sea 'id' o termine en 'id' (excepto si es parte del nombre de la clase)
            if (lowerName === 'id') return false;
            if (lowerName.endsWith('id')) return false;  // Excluir productId, customerId, etc.
            if (lowerName.includes('_id')) return false;

            return true;
        });
    }

    /**
     * Mapea tipos Java/UML a Dart
     */
    private mapType(type: string): string {
        return this.dartTypeMapping[type] || type;
    }

    /**
     * Convierte a snake_case cdc
     */
    private toSnakeCase(str: string): string {
        return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    }

    /**
     * Sanitiza nombres
     */
    private sanitizeName(name: string): string {
        return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }

    /**
     * Escribe un archivo
     */
    private async writeFile(filePath: string, content: string) {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }
}
