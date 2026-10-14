import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  password: { type: String, required: true, select: false },
}, { timestamps: true, collection: 'users', versionKey: false });

export type UserFields = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);

export function publicUser(user: UserFields & { _id: unknown }) {
  return {
    _id: String(user._id), name: user.name, email: user.email,
    createdAt: user.createdAt, updatedAt: user.updatedAt,
  };
}
