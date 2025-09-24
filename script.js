// --- Configuration ---
const N8N_WEBHOOK_URL = 'http://localhost:5678/webhook/08f3acc1-2ec8-4bac-ba4c-3225a8e87662';


// --- Session ID ---
const sessionId = crypto.randomUUID();
console.log('Session ID:', sessionId);

// --- HTML Element References ---
const chatOutput = document.getElementById('chat-output');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const enterVoiceModeButton = document.getElementById('enter-voice-mode-button');
const startConversationButton = document.getElementById('start-conversation-button');
const stopConversationButton = document.getElementById('stop-conversation-button');
const backToTextButton = document.getElementById('back-to-text-button');
const statusElement = document.getElementById('status'); // Keep for general status messages
const voiceStatusDisplay = document.getElementById('voice-status-display');
const languageSelect = document.getElementById('language-select');

// New status text elements
const statusTextListening = document.getElementById('status-text-listening');
const statusTextThinking = document.getElementById('status-text-thinking');
const statusTextSpeaking = document.getElementById('status-text-speaking');
const statusTextIdle = document.getElementById('status-text-idle');


// --- Language Map for Status Texts ---
const statusTexts = {
    'de-DE': {
        idle: 'Starte das Gespräch',
        listening: 'Sag dem Assistenten etwas',
        thinking: 'Der Assistent denkt gerade nach',
        speaking: 'Assistent spricht gerade'
    },
    'en-US': {
        idle: 'Start the conversation',
        listening: 'Say something to the assistant',
        thinking: 'The assistant is thinking',
        speaking: 'Assistant is speaking'
    },
    'tr-TR': {
        idle: 'Konuşmayı başlat',
        listening: 'Asistana bir şey söyle',
        thinking: 'Asistan düşünüyor',
        speaking: 'Asistan konuşuyor'
    },
    'ar-SA': {
        idle: 'ابدأ المحادثة',
        listening: 'قل شيئًا للمساعد',
        thinking: 'المساعد يفكر',
        speaking: 'المساعد يتحدث'
    },
    'ru-RU': {
        idle: 'Начать разговор',
        listening: 'Скажите что-нибудь помощнику',
        thinking: 'Помощник думает',
        speaking: 'Помощник говорит'
    },
    'uk-UA': {
        idle: 'Почати розмову',
        listening: 'Скажіть щось помічнику',
        thinking: 'Помічник думає',
        speaking: 'Помічник говорить'
    }
};

// --- Vapi Integration ---
let vapi;

function initVapi() {
  vapi = window.vapiSDK.run({
    apiKey: "31bcbc02-b477-4319-af52-5bfdad57ee45",    // <-- einsetzen
    assistant: "d2b23550-4ba2-43d1-bdb8-38fa43ce25d6",  // <-- einsetzen
    config: {showButton: false}
  });

  // Wenn Nutzer spricht -> Text kommt als Transcript
  vapi.on("message", async (msg) => {
    if (msg.transcript) {
      console.log("User sagte (Vapi):", msg.transcript);
      await handleSend(msg.transcript, true);
    }
  });

  vapi.on("call-start", () => {
    console.log("Vapi Call Started");
    setUIMode('voiceActive');
    const selectedLang = languageSelect.value;
    statusTextIdle.textContent = '';
    statusTextListening.textContent = statusTexts[selectedLang]?.listening || statusTexts['de-DE'].listening;
    voiceStatusDisplay.className = 'listening';
  });

  vapi.on("call-end", () => {
    console.log("Vapi Call Ended");
    setUIMode('voiceIdle'); // Go back to idle after call ends
  });

  vapi.on("listening-start", () => {
    console.log("Vapi Listening Started");
    const selectedLang = languageSelect.value;
    statusTextIdle.textContent = '';
    statusTextThinking.textContent = '';
    statusTextSpeaking.textContent = '';
    statusTextListening.textContent = statusTexts[selectedLang]?.listening || statusTexts['de-DE'].listening;
    voiceStatusDisplay.className = 'listening';
  });

  vapi.on("listening-stop", () => {
    console.log("Vapi Listening Stopped");
    // When listening stops, it usually means user finished speaking or conversation ended.
    // We might transition to thinking or idle depending on context.
    // For now, clear listening status. Thinking status will be set by handleSend.
    statusTextListening.textContent = '';
    // If not in thinking state, go to idle
    if (voiceStatusDisplay.className !== 'thinking') {
        const selectedLang = languageSelect.value;
        statusTextIdle.textContent = statusTexts[selectedLang]?.idle || statusTexts['de-DE'].idle;
        voiceStatusDisplay.className = 'idle';
    }
  });

  vapi.on("speech-start", () => {
    console.log("Vapi Speech Started (Bot)");
    const selectedLang = languageSelect.value;
    statusTextListening.textContent = '';
    statusTextThinking.textContent = '';
    statusTextSpeaking.textContent = statusTexts[selectedLang]?.speaking || statusTexts['de-DE'].speaking;
    voiceStatusDisplay.className = 'speaking';
  });

  vapi.on("speech-end", () => {
    console.log("Vapi Speech Ended (Bot)");
    // After bot speaks, it should go back to listening for user input
    const selectedLang = languageSelect.value;
    statusTextSpeaking.textContent = '';
    statusTextListening.textContent = statusTexts[selectedLang]?.listening || statusTexts['de-DE'].listening;
    voiceStatusDisplay.className = 'listening';
  });

  vapi.on("error", (e) => {
    console.error("Vapi Error:", e);
    statusElement.textContent = `Vapi Fehler: ${e.message}.`;
    statusElement.className = 'error';
    voiceStatusDisplay.className = 'error';
    setUIMode('voiceIdle'); // Revert to idle on error
  });
}

// Init Vapi sobald SDK geladen ist
window.onload = () => {
  const check = setInterval(() => {
    if (window.vapiSDK) {
      clearInterval(check);
      initVapi();
    }
  }, 200);
};


// --- State Variables ---
let currentMode = 'text';
let typingIndicatorElement = null;


// --- Core Functions ---
function addMessageToChat(text, sender) {
    if (currentMode === 'text' || (currentMode === 'voiceIdle' && sender === 'bot')) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
        messageElement.textContent = text;
        chatOutput.appendChild(messageElement);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }
}

function showTypingIndicator(show) {
    if (show && currentMode === 'text') {
        if (!typingIndicatorElement) {
            typingIndicatorElement = document.createElement('div');
            typingIndicatorElement.classList.add('message', 'bot-message', 'typing-indicator');
            typingIndicatorElement.innerHTML = '<span></span><span></span><span></span>';
            chatOutput.appendChild(typingIndicatorElement);
            chatOutput.scrollTop = chatOutput.scrollHeight;
        }
    } else {
        if (typingIndicatorElement) {
            typingIndicatorElement.remove();
            typingIndicatorElement = null;
        }
    }
}

async function handleSend(text, isFromVoice = false) {
    if (!text.trim()) return;

    if (!isFromVoice) {
        addMessageToChat(text, 'user');
        textInput.value = '';
        // Remove inline height style to allow CSS/rows attribute to reset height
        textInput.style.removeProperty('height');
        textInput.style.height = 'auto';
        showTypingIndicator(true);
    } else {
        const selectedLang = languageSelect.value;
        statusTextListening.textContent = ''; // Clear listening text
        statusTextThinking.textContent = statusTexts[selectedLang]?.thinking || statusTexts['de-DE'].thinking; // Set thinking text based on language
        statusTextSpeaking.textContent = ''; // Clear speaking text
        statusTextIdle.textContent = ''; // Clear idle text
        statusElement.textContent = ''; // Clear general status
        voiceStatusDisplay.className = 'thinking';
        console.log("Set voiceStatusDisplay class to: thinking");
    }

    try {
        console.log(`Sending to n8n (${isFromVoice ? 'voice' : 'text'}):`, text);
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatInput: text, sessionId: sessionId }),
        });

        if (!isFromVoice) { showTypingIndicator(false); }

        if (!response.ok) { throw new Error(`n8n request failed with status ${response.status}`); }
        const result = await response.json();
        const botResponseText = result.output;
        if (!botResponseText) { throw new Error('n8n response did not contain an "output" field.'); }
        console.log('Received from n8n:', botResponseText);

        if (!isFromVoice) {
            addMessageToChat(botResponseText, 'bot');
        } else {
            await vapi.speak(botResponseText);
        }    
    } catch (error) {
        console.error('Error sending/receiving message:', error);
        if (!isFromVoice) {
             showTypingIndicator(false);
            addMessageToChat(`Fehler: ${error.message}`, 'bot');
        } else {
             statusElement.textContent = `n8n Fehler: ${error.message}. Klicken zum Beenden/Neustarten.`;
             statusElement.className = 'error';
             voiceStatusDisplay.className = 'error';
        }
    }
}



// --- UI Mode Management & Event Listeners ---
function setUIMode(newMode) {
    console.log(`Setting UI Mode: ${newMode}`);
    const oldMode = currentMode;
    currentMode = newMode;
    document.body.className = '';

    // Clear all status texts initially
    statusTextListening.textContent = '';
    statusTextThinking.textContent = '';
    statusTextSpeaking.textContent = '';
    statusTextIdle.textContent = '';
    statusElement.textContent = ''; // Clear general status

    const selectedLang = languageSelect.value; // Get selected language

    switch (newMode) {
        case 'text':
            document.body.classList.add('text-mode');
            // Stops are handled by the button listeners triggering this mode change
            statusElement.style.display = 'none'; // General status hidden in text mode
            voiceStatusDisplay.className = '';
            break;
        case 'voiceIdle':
            document.body.classList.add('voice-mode-idle');
            statusTextIdle.textContent = statusTexts[selectedLang]?.idle || statusTexts['de-DE'].idle; // Set idle text based on language
            statusElement.className = '';
            voiceStatusDisplay.className = 'idle';
            // Stops are handled by the button listeners triggering this mode change
            break;
        case 'voiceActive':
            document.body.classList.add('voice-mode-active');
            // Status text will be set by recognition/speakText handlers
            break;
    }
}

// --- Attach Event Listeners ---
sendButton.addEventListener('click', () => handleSend(textInput.value));
textInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') {
    event.preventDefault();
    handleSend(textInput.value);
} });

// Auto-resize textarea based on content
textInput.addEventListener('input', () => {
    textInput.style.height = 'auto'; // Reset height to recalculate
    textInput.style.height = textInput.scrollHeight + 'px'; // Set height based on content scroll height
});


enterVoiceModeButton.addEventListener('click', () => {
    setUIMode('voiceIdle');
});


startConversationButton.addEventListener('click', () => {
    if (vapi) vapi.startListening();
});

stopConversationButton.addEventListener('click', () => {
    if (vapi) vapi.stopListening();
});

backToTextButton.addEventListener('click', () => {
    if (vapi) vapi.stopListening();
    setUIMode('text');
});

// --- Initial Setup ---
setUIMode('text');

// --- Initial Greeting Message (Text Mode) ---
const initialGreeting = "Hallo! Wie kann ich Ihnen helfen?";
addMessageToChat(initialGreeting, 'bot');
