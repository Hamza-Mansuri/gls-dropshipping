// Connects to local backend when developing, and Render backend when deployed live
window.DROPSHIPPING_API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.'))
  ? `http://${window.location.hostname}:5000`
  : 'https://gls-dropshipping-backend.onrender.com';
