const trioProxy = require("../../../../_lib/trioProxy");
module.exports = (req, res) => { const asset = Array.isArray(req.query.asset) ? req.query.asset[0] : req.query.asset; return trioProxy(req, res, ["v1", "assets", asset, "trades"]); };
