document.addEventListener('DOMContentLoaded', () => {
    const adminPanel = document.getElementById('admin-panel');
    const ttsContainer = document.getElementById('tts-container');
    const volumeSlider = document.getElementById('volume');
    const rateSlider = document.getElementById('rate');
    const pitchSlider = document.getElementById('pitch');
    const voiceSelect = document.getElementById('voice');
    const testText = document.getElementById('test-text');
    const testButton = document.getElementById('test-button');
    const skipButton = document.getElementById('skip-button');
    const pauseButton = document.getElementById('pause-button');
    const resumeButton = document.getElementById('resume-button');
    const clearButton = document.getElementById('clear-button');

    const queue = [];
    let isSpeaking = false;
    let isPaused = false;
    let currentUtterance = null;
    let voices = [];
    let settings = {
        volume: 1,
        rate: 1,
        pitch: 1,
        voice: null
    };
    
    // Chrome-specific fix: Track if speech synthesis has been enabled by user interaction
    let speechEnabled = false;
    let isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);

    /**
     * Enable speech synthesis with user interaction (Chrome fix)
     * Chrome requires a user interaction to enable speech synthesis
     */
    function enableSpeechSynthesis() {
        if (speechEnabled) return;
        
        try {
            // Create a silent utterance to enable speech synthesis
            const silentUtterance = new SpeechSynthesisUtterance('');
            silentUtterance.volume = 0;
            window.speechSynthesis.speak(silentUtterance);
            speechEnabled = true;
            console.log('Speech synthesis enabled via user interaction');
        } catch (error) {
            console.error('Failed to enable speech synthesis:', error);
        }
    }

    function loadVoices() {
        voices = window.speechSynthesis.getVoices();
        voiceSelect.innerHTML = voices
            .map((voice, index) => `<option value="${index}">${voice.name} (${voice.lang})</option>`)
            .join('');
        if (settings.voice) {
            const voiceIndex = voices.findIndex(v => v.name === settings.voice.name && v.lang === settings.voice.lang);
            if (voiceIndex > -1) {
                voiceSelect.value = voiceIndex;
            }
        }
    }

    function processQueue() {
        if (isSpeaking || isPaused || queue.length === 0) {
            return;
        }
        isSpeaking = true;
        const { text, user } = queue.shift();
        displayTts(user, text);
        speak(text);
    }

    function speak(text) {
        if (text) {
            // Chrome fix: Enable speech synthesis on first speak attempt
            if (isChrome && !speechEnabled) {
                enableSpeechSynthesis();
            }
            
            const utterance = new SpeechSynthesisUtterance(text);
            currentUtterance = utterance;
            utterance.volume = settings.volume;
            utterance.rate = settings.rate;
            utterance.pitch = settings.pitch;
            if (settings.voice) {
                utterance.voice = settings.voice;
            }
            
            utterance.onstart = () => {
                console.log('Speech started');
                // Chrome fix: Resume immediately to prevent pausing
                if (isChrome) {
                    window.speechSynthesis.resume();
                }
            };
            
            utterance.onend = () => {
                isSpeaking = false;
                currentUtterance = null;
                hideTts();
                processQueue();
            };
            
            utterance.onerror = (event) => {
                console.error('SpeechSynthesisUtterance.onerror', event);
                
                // Chrome fix: Retry on 'interrupted' or 'canceled' errors
                if (isChrome && (event.error === 'interrupted' || event.error === 'canceled')) {
                    console.log('Chrome TTS error, retrying with resume...');
                    window.speechSynthesis.cancel();
                    setTimeout(() => {
                        window.speechSynthesis.speak(utterance);
                    }, 100);
                    return;
                }
                
                isSpeaking = false;
                currentUtterance = null;
                hideTts();
                processQueue();
            };
            
            // Chrome fix: Cancel any pending speech before starting new one
            if (isChrome) {
                window.speechSynthesis.cancel();
            }
            
            window.speechSynthesis.speak(utterance);
            
            // Chrome fix: Resume after a short delay to prevent automatic pausing
            if (isChrome) {
                setTimeout(() => {
                    window.speechSynthesis.resume();
                }, 100);
            }
        } else {
            isSpeaking = false;
            processQueue();
        }
    }

    function displayTts(user, text) {
        ttsContainer.innerHTML = `<p><strong>${user}:</strong> ${text}</p>`;
        ttsContainer.style.display = 'block';
    }

    function hideTts() {
        ttsContainer.style.display = 'none';
    }

    function connect() {
        const urlParams = new URLSearchParams(window.location.search);
        const isAdmin = urlParams.get('admin') === 'true';

        if (isAdmin) {
            adminPanel.style.display = 'block';
            loadSettings();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices;
            }
            loadVoices();
        }

        // Use the current page's host and port for WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        const port = window.location.port || '3000';
        const wsUrl = `${protocol}//${host}:${port}`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected to', wsUrl);
            // Chrome fix: Enable speech synthesis when websocket connects
            if (isChrome && !speechEnabled) {
                console.log('Chrome detected - speech synthesis will be enabled on first user interaction');
            }
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'tts') {
                queue.push(data.payload);
                processQueue();
            }
        };
        ws.onclose = () => {
            console.log('WebSocket disconnected, attempting to reconnect...');
            setTimeout(connect, 2000);
        };
        ws.onerror = (error) => console.error('WebSocket error:', error);
    }

    function updateSetting(key, value, isVoice = false) {
        if (isVoice) {
            settings[key] = voices[value] || null;
        } else {
            settings[key] = parseFloat(value);
        }
        saveSettings();
    }

    function saveSettings() {
        const voiceData = settings.voice ? { name: settings.voice.name, lang: settings.voice.lang } : null;
        const settingsToSave = { ...settings, voice: voiceData };
        localStorage.setItem('ttsSettings', JSON.stringify(settingsToSave));
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem('ttsSettings');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            settings.volume = parsed.volume || 1;
            settings.rate = parsed.rate || 1;
            settings.pitch = parsed.pitch || 1;
            settings.voice = parsed.voice || null;

            volumeSlider.value = settings.volume;
            rateSlider.value = settings.rate;
            pitchSlider.value = settings.pitch;
        }
    }

    // Event Listeners
    volumeSlider.addEventListener('input', (e) => {
        enableSpeechSynthesis(); // Enable on user interaction
        updateSetting('volume', e.target.value);
    });
    
    rateSlider.addEventListener('input', (e) => {
        enableSpeechSynthesis(); // Enable on user interaction
        updateSetting('rate', e.target.value);
    });
    
    pitchSlider.addEventListener('input', (e) => {
        enableSpeechSynthesis(); // Enable on user interaction
        updateSetting('pitch', e.target.value);
    });
    
    voiceSelect.addEventListener('change', (e) => {
        enableSpeechSynthesis(); // Enable on user interaction
        updateSetting('voice', e.target.value, true);
    });

    testButton.addEventListener('click', () => {
        enableSpeechSynthesis(); // Enable on user interaction
        const text = testText.value;
        if (text) {
            speak(text);
        }
    });

    skipButton.addEventListener('click', () => {
        enableSpeechSynthesis(); // Enable on user interaction
        if (isSpeaking && currentUtterance) {
            window.speechSynthesis.cancel();
        }
    });

    pauseButton.addEventListener('click', () => {
        enableSpeechSynthesis(); // Enable on user interaction
        if (isSpeaking && !isPaused) {
            isPaused = true;
            window.speechSynthesis.pause();
        }
    });

    resumeButton.addEventListener('click', () => {
        enableSpeechSynthesis(); // Enable on user interaction
        if (isPaused) {
            isPaused = false;
            window.speechSynthesis.resume();
        }
    });

    clearButton.addEventListener('click', () => {
        enableSpeechSynthesis(); // Enable on user interaction
        queue.length = 0;
        if (isSpeaking) {
            window.speechSynthesis.cancel();
        }
    });
    
    // Chrome fix: Add click listener to document to enable speech synthesis
    if (isChrome) {
        document.addEventListener('click', () => {
            if (!speechEnabled) {
                enableSpeechSynthesis();
            }
        }, { once: true });
    }

    // Initial connection
    connect();
});