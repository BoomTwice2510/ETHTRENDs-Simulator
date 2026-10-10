const trioProxy = require("../../../_lib/trioProxy");
module.exports = (req, res) => trioProxy(req, res, ["v1", "assets"]);
