function authorize(...roles) {
  return (req, res, next) => {
    const role = req.auth?.role;
    if (!role || (roles.length > 0 && !roles.includes(role))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}

module.exports = { authorize };
