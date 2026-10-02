const User = require('../models/User');

const userRepository = {
  findById: (id, withSecrets = false) => User.findById(id).select(withSecrets ? '+passwordHash +refreshJti' : ''),
  findByEmail: (email, withSecrets = false) => User.findOne({ email: email.toLowerCase() }).select(withSecrets ? '+passwordHash' : ''),
  count: (filter = {}) => User.countDocuments(filter),
  create: (data) => User.create(data),
  update: (id, data) => User.findByIdAndUpdate(id, data, { new: true, runValidators: true }),
  list: () => User.find().sort({ createdAt: 1 }).lean(),
};

module.exports = userRepository;
