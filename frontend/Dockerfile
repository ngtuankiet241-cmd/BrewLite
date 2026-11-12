FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
