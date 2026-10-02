// Profile picture with an initials fallback.
export default function Avatar({ user, size = 32 }) {
  const initials = (user?.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return user?.avatarUrl ? (
    <img className="avatar" src={user.avatarUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">{initials}</span>
  );
}
