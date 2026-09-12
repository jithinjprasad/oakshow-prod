FROM 172.18.0.253:5000/408d193f-88ad-4b4c-bcea-587580f4f877/oakshow:latest
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]