const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '.env');

fs.unlink(filePath, (err) => {
  if (err) {
    if (err.code === 'ENOENT') {
      console.error('Archivo .env no encontrado.');
    } else {
      console.error('Error al eliminar el archivo .env:', err);
    }
    return;
  }
  console.log('Archivo .env eliminado exitosamente.');
});
