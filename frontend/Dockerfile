# Jeden Dockerfile pre oba portály, vyberá sa build-argumentom APP:
#   APP=candidate – portál uchádzača (nginx.candidate.conf)
#   APP=hr        – HR portál (nginx.hr.conf)
ARG APP=candidate

FROM node:22-alpine AS build
ARG APP
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# VITE_APP vyberie v src/main.jsx aplikáciu (CandidateApp / HrApp)
RUN VITE_APP=$APP npm run build

FROM nginx:1.27-alpine
ARG APP
COPY nginx.${APP}.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
