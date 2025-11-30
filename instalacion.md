# Instrucciones de Instalación

Este documento contiene las instrucciones paso a paso para instalar y configurar el proyecto **Digramador Server** (API NestJS).

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado en tu sistema:

- **Node.js** versión 20.x o superior
  - Puedes verificar tu versión ejecutando: `node --version`
  - Si no lo tienes instalado, descárgalo desde [nodejs.org](https://nodejs.org/)
  
- **Docker** y **Docker Compose**
  - Necesario para levantar la base de datos PostgreSQL
  - Verifica que Docker esté corriendo: `docker --version`
  - Descarga desde [docker.com](https://www.docker.com/get-started)

- **npm** (normalmente viene con Node.js)
  - Verifica la versión: `npm --version`

- **Git** (para clonar el repositorio)

## 🚀 Pasos de Instalación

### 1. Clonar el Repositorio

Si aún no tienes el proyecto, clónalo desde el repositorio:

```bash
git clone <URL_DEL_REPOSITORIO>
cd digramador-server-main
```

### 2. Instalar Dependencias de Node.js

Instala todas las dependencias del proyecto ejecutando:

```bash
npm install
```

Este comando instalará todas las dependencias listadas en `package.json`.

### 3. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto. Si existe un archivo `.env.template`, puedes copiarlo como base:

```bash
# En Windows (PowerShell)
Copy-Item .env.template .env

# En Linux/Mac
cp .env.template .env
```

Si no existe `.env.template`, crea el archivo `.env` manualmente con las siguientes variables:

```env
# Puerto en el que correrá la aplicación
PORT=3000

# Configuración de la Base de Datos PostgreSQL
DB_HOST=localhost
DB_PORT=5431
DB_NAME=tu_nombre_db
DB_USERNAME=tu_usuario_db
DB_PASSWORD=tu_contraseña_db

# Secreto para JWT (genera una cadena aleatoria segura)
JWT_SECRET=tu_secreto_jwt_muy_seguro_aqui

# Entorno (opcional: 'prod' para producción, o dejar vacío para desarrollo)
STAGE=
```

**⚠️ IMPORTANTE:** 
- Genera un `JWT_SECRET` seguro y único (puedes usar un generador de strings aleatorios)
- Asegúrate de que `DB_PASSWORD` y `DB_NAME` coincidan con los valores que usarás en `docker-compose.yaml`

### 4. Configurar Docker Compose

El archivo `docker-compose.yaml` necesita que las variables `DB_PASSWORD` y `DB_NAME` estén definidas en tu archivo `.env`. Asegúrate de que estos valores coincidan:

```yaml
# En docker-compose.yaml se espera:
POSTGRES_PASSWORD: ${DB_PASSWORD}
POSTGRES_DB: ${DB_NAME}
```

### 5. Levantar la Base de Datos con Docker

Ejecuta el siguiente comando para levantar el contenedor de PostgreSQL:

```bash
docker-compose up -d
```

Este comando:
- Descargará la imagen de PostgreSQL 14.3 (si no la tienes)
- Creará un contenedor llamado `parcial2sw`
- Expondrá PostgreSQL en el puerto `5431` (mapeado desde el puerto interno 5432)
- Usará un volumen local `./postgres` para persistir los datos

Para verificar que el contenedor está corriendo:

```bash
docker ps
```

Deberías ver el contenedor `parcial2sw` en la lista.

### 6. Iniciar la Aplicación en Modo Desarrollo

Una vez que la base de datos esté corriendo, inicia la aplicación:

```bash
npm run start:dev
```

Este comando:
- Compilará el código TypeScript
- Iniciará el servidor en modo desarrollo con hot-reload
- La aplicación estará disponible en `http://localhost:3000` (o el puerto que configuraste en `.env`)

### 7. Cargar Datos de Prueba (SEED)

Para poblar la base de datos con datos iniciales de prueba, ejecuta el endpoint de seed:

**Opción 1: Desde el navegador**
Abre tu navegador y visita:
```
http://localhost:3000/api/seed
```

**Opción 2: Con curl (en terminal)**
```bash
curl http://localhost:3000/api/seed
```

**Opción 3: Con PowerShell (Windows)**
```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/seed
```

## 📚 Información Adicional

### Comandos Útiles

- **Desarrollo con hot-reload:**
  ```bash
  npm run start:dev
  ```

- **Compilar el proyecto:**
  ```bash
  npm run build
  ```

- **Ejecutar en producción:**
  ```bash
  npm run start:prod
  ```

- **Ejecutar tests:**
  ```bash
  npm run test
  ```

- **Ejecutar linter:**
  ```bash
  npm run lint
  ```

### Documentación de la API (Swagger)

Una vez que la aplicación esté corriendo, puedes acceder a la documentación interactiva de Swagger en:

```
http://localhost:3000/api
```

### Detener la Base de Datos

Para detener el contenedor de PostgreSQL:

```bash
docker-compose down
```

Para detener y eliminar los volúmenes (⚠️ esto borrará los datos):

```bash
docker-compose down -v
```

### Ver Logs de Docker

Para ver los logs del contenedor de la base de datos:

```bash
docker-compose logs -f db
```

## 🔧 Solución de Problemas

### Error: Puerto ya en uso
Si el puerto 3000 (o el que configuraste) ya está en uso, cambia el valor de `PORT` en tu archivo `.env`.

### Error: No se puede conectar a la base de datos
1. Verifica que Docker esté corriendo
2. Verifica que el contenedor de PostgreSQL esté activo: `docker ps`
3. Revisa que las variables de entorno en `.env` coincidan con las de `docker-compose.yaml`
4. Revisa los logs: `docker-compose logs db`

### Error: Variables de entorno no encontradas
Asegúrate de que el archivo `.env` existe en la raíz del proyecto y contiene todas las variables necesarias.

### Error al ejecutar npm install
- Verifica que tienes Node.js 20.x instalado
- Intenta eliminar `node_modules` y `package-lock.json` y ejecutar `npm install` nuevamente
- Si persiste, verifica tu conexión a internet

## 📝 Notas Importantes

- El proyecto usa **TypeORM** con `synchronize: true` en desarrollo, lo que significa que las tablas se crean/actualizan automáticamente según las entidades.
- En producción, se recomienda usar migraciones en lugar de `synchronize: true`.
- El puerto por defecto de PostgreSQL en Docker es `5431` (mapeado desde el puerto interno 5432).
- La aplicación usa CORS habilitado globalmente.
- Los archivos estáticos se guardan en la carpeta `static/`.

## 🎉 ¡Listo!

Si seguiste todos los pasos correctamente, deberías tener:
- ✅ La base de datos PostgreSQL corriendo en Docker
- ✅ La aplicación NestJS corriendo en modo desarrollo
- ✅ Datos de prueba cargados en la base de datos
- ✅ Acceso a la documentación Swagger en `/api`

¡Feliz desarrollo! 🚀

