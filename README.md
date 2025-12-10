# 🧠 AI Health Agent (Voice-Guided Health & Autism Screening Prototype)

An educational prototype demonstrating **voice-based interaction**, **AI-powered wellness guidance**, and a **structured autism screening flow**, built using:

- 🎧 Speech Recognition (Web Speech API)  
- 🗣️ Text-to-Speech avatar  
- 🤖 AI reasoning (LLM via FastAPI backend)  
- 📋 Autism screening with Likert-scale questions  
- 🌍 Frontend in React (Vite) + FastAPI backend

> ⚠️ **This prototype is for educational use only.  
Not for diagnosis, emergencies, or medical decision-making.**

---

## 🚀 Features

### 🗣️ Voice Interaction  
- Real-time speech-to-text  
- Natural text-to-speech with animated avatar  
- Empathetic prompts when user struggles or stays silent  

### 👨‍⚕️ Ask-AI Wellness Chat  
- Conversational wellness support  
- Safety-first guidance  
- Emergency keyword detection (e.g., “chest pain”)  
- Redirects to emergency instructions with high-priority alert  

### 🧩 Autism Screening (Voice-Guided)  
- 10 questions with Likert-scale answers  
- Voice or button answering  
- Intelligent mapping of spoken phrases to Likert choices  
- Automatic narration of each question  
- Full session summary  

### 🧱 Modular Architecture  
- React frontend  
- FastAPI backend  
- Session management  
- Cleanly extendable modules  

---

## 📦 Installation & Setup

### 1️⃣ Clone the repository

```bash
git clone https://github.com/dhakal07/ai-health-agent.git
cd ai-health-agent
```

---

### 2️⃣ Backend Setup (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at:

```
http://127.0.0.1:8000
```

---

### 3️⃣ Frontend Setup (React + Vite)

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at:

```
http://127.0.0.1:5173
```

---

## 🧩 System Architecture

### **Frontend (React + Vite)**  
- Voice Recognition (Web Speech API)  
- Avatar (TTS)  
- Ask-AI Wellness Chat  
- Autism Screening Flow  
- API Client → FastAPI  

### **FastAPI Backend**  
- LLM Processing (Llama 3 or compatible)  
- Emergency Keyword Detection  
- Session Handling  
- Structured Answer Processing  

### **Database (Optional)**  
- MongoDB for saving screening sessions  

---

## 🖼️ Screenshots (Optional)

Insert project screenshots here:

- `Ask AI` interface  
- Emergency alert screen  
- Autism screening module  

---

## 🛠️ Technologies Used

| Component | Technology |
|----------|------------|
| Frontend | React, Vite, Web Speech API |
| Backend | FastAPI, Python, Uvicorn |
| LLM | Llama3 (or compatible) |
| Database | MongoDB (optional) |
| Styling | Custom CSS |
| Config | `.env` |

---

## 🧠 How It Works

### 1. User speaks → Voice-to-text  
### 2. AI interprets input  
### 3. System generates:  
- Wellness advice  
- Autism screening question flow  
- Emergency alert if needed  

### 4. Avatar narrates responses  
### 5. Session summary is generated at the end  

---

## 🔍 Emergency Detection Logic

If user says:

- “chest pain”  
- “cannot breathe”  
- “severe bleeding”  
- “unconscious”  

System triggers:

➡️ **EMERGENCY ALERT — CALL 112 IMMEDIATELY**  
➡️ Stops normal chat  
➡️ Provides nearest hospitals (if finder enabled)  

---

## 📊 Autism Screening Flow

- 10 voice-guided questions  
- 4 selectable options  
- Skip/Back/Next controls  
- Confirm + Finish  
- Summary includes:  
  - total questions answered  
  - score  
  - interpretation  
  - guidance  

---

## 🚧 Known Limitations

- Not a medical tool  
- Browser speech recognition accuracy varies  
- First TTS prompt may be blocked by browser autoplay restrictions  
- Emergency detection is keyword-based  

---

## 🔮 Future Improvements

- More screening modules (anxiety, depression, ADHD)  
- Improved emergency triage reasoning  
- Real user accounts + saving history  
- Multi-language support  
- Full UI/UX redesign for accessibility  
- Cloud deployment with HTTPS  

---

## 👥 Project Contributors

Team Members:  
- Dhakal Rajiv  
- Komal Gautam  
- MD Hossain  
- Jimmy Söderström  

---

## 👤 Author (Repository Owner)

**Rajiv Dhakal**  
GitHub: https://github.com/dhakal07  

---

## 🛑 Disclaimer

This system is created **for educational demonstration only**.  
It **must not** be used for diagnosis, emergencies, or medical decisions.

---

