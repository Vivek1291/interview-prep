const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    avatarUrl: { type: String, default: '' },
    refreshJti: { type: String, select: false }, // id of the only valid refresh token (rotation)
  },
  { timestamps: true }
);

// Never send secrets to the client
UserSchema.methods.toPublic = function toPublic() {
  return { _id: this._id, name: this.name, email: this.email, role: this.role, avatarUrl: this.avatarUrl, createdAt: this.createdAt };
};

module.exports = mongoose.model('User', UserSchema);
