# Dockerfile para producción en Ubuntu
FROM node:18

# Crear carpeta de la app
den WORKDIR /app

# Copiar dependencias
env copy package.json package-lock.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Copiar el resto del código
COPY . .

# Exponer el puerto si aplica (ajustar si es necesario)
EXPOSE 3000

# Comando por defecto
en CMD ["npm", "start"]
