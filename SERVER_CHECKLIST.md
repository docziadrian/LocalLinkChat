# Ubuntu Server Configuration Checklist

## CORS & Network Configuration

### 1. **Firewall (UFW)**
```bash
# Check firewall status
sudo ufw status

# Allow your application port (default: 5000)
sudo ufw allow 5000/tcp

# If using HTTPS, allow ports 80 and 443
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall if not already enabled
sudo ufw enable
```

### 2. **Reverse Proxy (Nginx) - Recommended**

If using Nginx as reverse proxy, configure:

**File: `/etc/nginx/sites-available/your-app`**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Increase client max body size for video uploads
    client_max_body_size 200M;
    client_body_timeout 300s;
    client_header_timeout 300s;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for large uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # CORS headers (if needed)
        add_header 'Access-Control-Allow-Origin' '$http_origin' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

**Enable and restart:**
```bash
sudo ln -s /etc/nginx/sites-available/your-app /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### 3. **Node.js Process Management (PM2)**

```bash
# Install PM2
npm install -g pm2

# Start your app
pm2 start server/index.ts --name locallinkchat --interpreter tsx

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 4. **Environment Variables**

Create `.env` file with:
```bash
PORT=5000
NODE_ENV=production
ALLOWED_ORIGINS=https://your-domain.com,http://your-domain.com
```

### 5. **File Upload Directories Permissions**

```bash
# Ensure directories exist and have correct permissions
sudo mkdir -p /path/to/app/profile_pictures
sudo mkdir -p /path/to/app/post_images
sudo mkdir -p /path/to/app/short_videos

# Set ownership (replace 'your-user' with your actual user)
sudo chown -R your-user:your-user /path/to/app/profile_pictures
sudo chown -R your-user:your-user /path/to/app/post_images
sudo chown -R your-user:your-user /path/to/app/short_videos

# Set permissions
chmod 755 /path/to/app/profile_pictures
chmod 755 /path/to/app/post_images
chmod 755 /path/to/app/short_videos
```

### 6. **SSL/TLS Certificate (Let's Encrypt)**

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (should be automatic)
sudo certbot renew --dry-run
```

### 7. **System Limits**

Check and increase if needed:
```bash
# Check current limits
ulimit -a

# Edit limits (add to /etc/security/limits.conf)
sudo nano /etc/security/limits.conf
# Add:
# your-user soft nofile 65536
# your-user hard nofile 65536

# For nginx (if using)
sudo nano /etc/nginx/nginx.conf
# Add in http block:
# worker_rlimit_nofile 65536;
```

### 8. **Check Application Logs**

```bash
# PM2 logs
pm2 logs locallinkchat

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# System logs
sudo journalctl -u nginx -f
```

### 9. **Network Connectivity Test**

```bash
# Test if port is accessible
curl -I http://localhost:5000

# Test from external (replace with your IP)
curl -I http://your-server-ip:5000

# Check if process is listening
sudo netstat -tlnp | grep 5000
# or
sudo ss -tlnp | grep 5000
```

### 10. **Database Permissions**

```bash
# Ensure database file has correct permissions
sudo chown your-user:your-user /path/to/app/locallinkchat.db
chmod 644 /path/to/app/locallinkchat.db
```

## Quick Troubleshooting

### NetworkError Issues:
1. ✅ Check firewall allows port 5000
2. ✅ Verify reverse proxy configuration (if using)
3. ✅ Check CORS headers in response
4. ✅ Verify file size limits (200MB)
5. ✅ Check timeout settings (300s for large uploads)
6. ✅ Verify SSL certificate is valid (if using HTTPS)

### Common Issues:
- **413 Payload Too Large**: Increase `client_max_body_size` in Nginx
- **NetworkError**: Check firewall, reverse proxy, and CORS settings
- **Timeout**: Increase timeout values in Nginx and Express
- **Permission Denied**: Check file/directory permissions

## Testing CORS

Test from browser console:
```javascript
fetch('https://your-domain.com/api/config', {
  credentials: 'include',
  method: 'GET'
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

