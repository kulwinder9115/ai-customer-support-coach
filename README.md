# AI Customer Support Coach 🤖

An AI-powered customer support training platform designed to help support representatives practice customer interactions, retrieve company policy information, and review previous training sessions.

## 🚀 Overview

AI Customer Support Coach combines conversational AI with a knowledge base to support realistic customer service training. It provides different modes for practicing conversations, querying company policies, and reviewing saved sessions.

The project uses a React frontend and a FastAPI backend, with Retrieval-Augmented Generation (RAG) to ground responses in relevant knowledge-base documents.

## ✨ Key Features

- **Simulator Mode:** Practice customer support conversations in a simulated environment.
- **Manual Mode:** Submit queries and retrieve the top three relevant knowledge-base passages with source filenames.
- **Replay Mode:** Review previously saved training sessions and conversation history.
- **Knowledge Base:** Upload company policy and FAQ PDFs for text extraction, chunking, and retrieval.
- **AI-Powered Responses:** Generate context-grounded answers using a large language model.
- **Source References:** Display relevant document sources to support responses.
- **Session Persistence:** Preserve session information across refreshes using the configured storage mechanism.
- **Interactive Interface:** Navigate training modes and knowledge-base functionality through a React-based UI.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js, Vite |
| Backend | Python, FastAPI |
| API Server | Uvicorn |
| PDF Processing | PyPDF |
| Retrieval | Embeddings and semantic similarity |
| Vector Storage | ChromaDB, if enabled in the current implementation |
| Language Model | Groq API |
| Session Storage | SQLite, if enabled in the current implementation |
| Environment Configuration | Python dotenv |

## 📁 Project Structure

```text
ai-coaching-assistant-v2/
├── backend/
│   ├── main.py
│   ├── conversation_agent.py
│   └── knowledge_base.py
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── IntroPage.jsx
│   │   └── KnowledgeBase.jsx
│   ├── package.json
│   └── vite.config.js
├── knowledge_base/
├── docs/
├── .gitignore
└── README.md
```

*Note: The structure is illustrative. Actual files and directories may differ as development progresses.*

## ⚙️ Prerequisites

Before running the application, ensure you have:

- Python 3.13 or a compatible version
- Node.js and npm
- Git
- A Groq API key for LLM-powered functionality

## 💻 Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/kulwinder9115/ai-customer-support-coach.git
cd ai-customer-support-coach
```

### 2. Configure the backend

Create and activate a Python virtual environment if you do not already have one.

**Windows PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies using the dependency file available in the repository.

Create a `.env` file in the project root and add your API key:

```env
GROQ_API_KEY=your_groq_api_key
```

Never commit your actual API key or `.env` file to GitHub.

Start the backend from the project root:

```powershell
uvicorn backend.main:app --reload
```

The backend API documentation should be available at:

http://127.0.0.1:8000/docs

### 3. Configure the frontend

Open a separate terminal in the project root and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL displayed in the terminal by Vite.

## 🔄 Application Workflow

1. The user opens the application and selects a training mode.
2. The frontend sends requests to the backend API.
3. The backend processes the request using the appropriate application component.
4. For knowledge-base queries, relevant passages are retrieved from indexed documents.
5. The language model uses the retrieved context when generating grounded responses.
6. The application presents the response, source information, or session details to the user.

## 📚 Knowledge Base and RAG

The knowledge base enables the application to answer questions using company-specific information.

The workflow includes:

1. Uploading company policy or FAQ PDFs.
2. Extracting text from uploaded documents.
3. Splitting extracted text into smaller chunks.
4. Creating embeddings and indexing chunks using the configured retrieval system.
5. Retrieving relevant passages in response to a query.
6. Providing the retrieved context to the language model.
7. Displaying relevant passages and source filenames where supported.

This approach helps make responses more relevant to company documentation instead of relying solely on the language model's general knowledge.

## 🔐 Security and Best Practices

- Keep API keys and credentials in environment variables.
- Exclude `.env`, `.venv/`, `node_modules/`, and sensitive local data from version control.
- Avoid uploading confidential company documents or real customer information to public repositories.
- Validate uploaded documents and handle unsupported or invalid files safely.

## 🧪 Testing

Test the application by:

- Starting the backend and checking the API documentation.
- Running the frontend and verifying navigation between modes.
- Uploading a sample policy PDF and checking the number of chunks stored.
- Submitting a query and verifying retrieved passages and source filenames.
- Checking that session information persists after a page refresh, where implemented.

## 👥 Contributors

Developed collaboratively as an AI/ML project focused on customer support training, conversational AI, and knowledge-base retrieval.

## 📌 Project Status

**Development in progress.**

Features and implementation details may evolve as the project develops.
