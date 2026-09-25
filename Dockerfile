FROM node:20-alpine
WORKDIR /app

# Copy production compiled site
COPY dist /app/dist

# Copy serverless handler across standard locations
COPY index.js /app/index.js
COPY index.cjs /app/index.cjs
COPY index.mjs /app/index.mjs
COPY handler.js /app/handler.js
COPY index.js /index.js
COPY index.cjs /index.cjs
COPY handler.js /handler.js

# Copy package config
COPY package.json /app/package.json
COPY package.json /package.json

# Symlink dist to root /dist for universal resolution
RUN ln -s /app/dist /dist 2>/dev/null || true

# Ensure all files and directories have full read/execute permissions for any runtime user
RUN chmod -R 777 /app && chmod 777 /index.js /index.cjs /handler.js /package.json 2>/dev/null || true

EXPOSE 8080

CMD ["node", "index.js"]
