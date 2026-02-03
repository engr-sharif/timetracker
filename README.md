# ⏱️ Jacobs TimeTracker

A modern, physics-based time tracking application for engineering consultants. Built with React and designed for minimal clicks and maximum productivity.

![TimeTracker Preview](https://img.shields.io/badge/Status-Active-emerald?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![Storage](https://img.shields.io/badge/Storage-GitHub%20Gist-purple?style=flat-square)

## ✨ Features

### Core Functionality
- **⚡ Quick Time Entry** - Log hours in as few clicks as possible
- **📊 Weekly Timesheet** - Visual overview of your billable hours
- **📁 Project Management** - Track project numbers and cost codes
- **📝 Notes System** - Keep project-related notes organized
- **☁️ Cloud Sync** - Data stored in GitHub Gist (works across devices!)

### Design Philosophy
- **🪟 Floating Panels** - Draggable windows with real physics (momentum, bounce)
- **🎨 Glassmorphism UI** - Modern, beautiful design with depth
- **🌙 Dark Theme** - Easy on the eyes during long work sessions
- **🔒 Private & Secure** - Your data is stored in YOUR private GitHub Gist

## 🚀 Quick Start

### Step 1: Deploy to GitHub Pages

1. Fork this repository (or create new repo and upload files)
2. Go to **Settings** → **Pages**
3. Set source to `main` branch, root folder
4. Your app will be live at `https://yourusername.github.io/timetracker`

### Step 2: First-Time Setup (One-Time)

When you first open the app, you'll need to connect it to GitHub for cloud storage:

1. Click the link to [create a GitHub token](https://github.com/settings/tokens/new?scopes=gist&description=Jacobs%20TimeTracker)
2. Click "Generate token" (gist scope is pre-selected)
3. Copy the token and paste it into the app
4. Enter your name and employee ID
5. Done! Your data will now sync automatically

### How Storage Works

- Your data is stored in a **private GitHub Gist** (only you can see it)
- The app auto-syncs whenever you make changes
- Works across devices - just use the same GitHub token
- Your token stays in your browser's localStorage (never sent anywhere except GitHub)

## 📖 Usage Guide

### Logging Time (3-4 Clicks!)

1. **Select Project** - Choose from your saved projects
2. **Pick Cost Code** - Click the appropriate code
3. **Enter Hours** - Use quick buttons (0.5, 1, 2, 4, 8) or custom
4. **Submit** - Done! (Auto-syncs to cloud)

### Managing Projects

1. Open the **Projects** panel
2. Click **+ Add New Project**
3. Enter:
   - Project Number (e.g., `P-2024-1234`)
   - Project Name
   - Cost Codes (comma-separated, e.g., `001-Design, 002-Review, 003-Meetings`)

### Floating Panels

- **Drag** the header to move panels
- **Throw** panels - they have momentum and bounce off edges!
- **Toggle** panels using the toolbar buttons
- **Close** panels with the X button

### Sync Indicator

Look for the sync status in the top bar:
- **○ Not synced** - Initial state
- **↻ Syncing...** - Saving to GitHub
- **✓ Synced** - All changes saved
- **✗ Sync error** - Click to retry

## 🎨 Customization

### Adding Your Company Branding

Edit the following in `index.html`:

```html
<!-- Change company name -->
<p className="text-white/50 mt-2">Your Company Name</p>

<!-- Change colors (search for these Tailwind classes) -->
from-cyan-500 to-emerald-500  <!-- Primary gradient -->
```

### Default Projects

Modify the `defaultProjects` array to pre-populate with your common projects:

```javascript
const defaultProjects = [
  { 
    id: '1', 
    name: 'Your Project Name', 
    number: 'P-2024-XXXX', 
    costCodes: ['001-Design', '002-Review'], 
    color: 'cyan' 
  },
];
```

## 🔮 Roadmap

- [ ] Export to CSV/Excel
- [ ] Sync with GitHub Gist for backup
- [ ] Timer mode for real-time tracking
- [ ] Weekly email reports
- [ ] Multiple themes
- [ ] Keyboard shortcuts
- [ ] Mobile-optimized view

## 🛠️ Tech Stack

- **React 18** - UI framework
- **Tailwind CSS** - Styling
- **LocalStorage** - Data persistence
- **Vanilla JS Physics** - Panel momentum/collision

## 📄 License

MIT License - feel free to use and modify for your needs!

---

Built with ☕ for engineers who value their time.
