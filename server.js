var express = require('express');
var app = express();
const port = process.env.PORT || 3000

app.listen(port, () => console.log(`Trackball listening on port ${port}!`));

app.use(express.static('public'));