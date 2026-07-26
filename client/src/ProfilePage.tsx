import { useState } from "react";
import type { AuthUser } from "./LoginPage";
import "./ProfilePage.css";

type Props = {
  user: AuthUser;
  onClose: () => void;
  onUpdated: (user: AuthUser) => void;
  onLogout: () => void;
};

function ProfilePage({ user, onClose, onUpdated, onLogout }: Props) {
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState(user.language);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [message, setMessage] = useState("");

  const saveProfile = async () => {
    const response = await fetch("/api/auth/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, language, avatarUrl }),
    });

    const result = await response.json();

    if (response.ok) {
      onUpdated(result.user);
      setMessage("Profile updated successfully.");
    } else {
      setMessage(result.message || "Could not update profile.");
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    onLogout();
  };

  return (
    <div className="profile-overlay">
      <section className="profile-modal">
        <button className="close-profile" onClick={onClose}>×</button>

        <p className="eyebrow">USER PROFILE</p>
        <div className="profile-heading">
          <div className="profile-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : user.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2>{user.name}</h2>
            <p>{user.role} · {user.email}</p>
          </div>
        </div>

        <label>
          Display name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label>
          Avatar image URL <small>(optional)</small>
          <input
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://example.com/photo.jpg"
          />
        </label>

        <label>
          Preferred language
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">English</option>
            <option value="ta">Tamil</option>
            <option value="kn">Kannada</option>
          </select>
        </label>

        {message && <p className="profile-message">{message}</p>}

        <div className="profile-actions">
          <button className="save-profile" onClick={saveProfile}>Save profile</button>
          <button className="logout-button" onClick={logout}>Log out</button>
        </div>
      </section>
    </div>
  );
}

export default ProfilePage;