# Optional Render deployment path if the native Node build has trouble installing Playwright browsers.
# Use this only if you switch the Render service runtime to Docker.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
