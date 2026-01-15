# Pi API deployment (api.lurkedaccounts.tech)

This bot runs its API on localhost and uses Nginx to expose it over HTTPS.

## 1) DNS
Create an A record:
- Name: api
- Value: your public IP

## 2) Router
Forward ports 80 and 443 to the Pi.

## 3) Install Nginx + Certbot
```
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

## 4) Nginx site
Copy the sample config and enable it:
```
sudo cp deploy/nginx-api.conf /etc/nginx/sites-available/api-lurkedaccounts
sudo ln -s /etc/nginx/sites-available/api-lurkedaccounts /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 5) HTTPS
```
sudo certbot --nginx -d api.lurkedaccounts.tech
```

## 6) Bot .env on the Pi
Set these values in your local `.env`:
```
API_PORT=3001
API_HOST=0.0.0.0
API_PUBLIC_URL=https://api.lurkedaccounts.tech
WEBSITE_URL=https://lurkedaccounts.tech
```

## 7) Website API base URL
Update your website API calls to use:
```
https://api.lurkedaccounts.tech
```
