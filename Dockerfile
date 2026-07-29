FROM node:20-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar dependencias y package.json
COPY package*.json ./

# Instalación limpia en producción
RUN npm ci --only=production

# Copiar el código fuente
COPY . .

# Puerto de la API
EXPOSE 3000

# Comando de inicio
CMD ["node", "server.js"]
