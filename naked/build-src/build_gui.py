#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LTTH Electron Installer Builder GUI
====================================
Eine benutzerfreundliche GUI zum Erstellen des LTTH Electron Installers.

Autor: GitHub Copilot
Version: 2.0.0
"""

import os
import sys
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
from datetime import datetime
from pathlib import Path
import json
import shutil
import signal
import atexit
import queue

class BuilderGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("🔨 Bob der Baumeister - LTTH Installer Builder")
        self.root.geometry("900x700")
        self.root.minsize(800, 600)
        
        # Register cleanup on window close
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        atexit.register(self.cleanup_processes)
        
        # Log queue for thread-safe logging
        self.log_queue = queue.Queue()
        
        # Farben
        self.colors = {
            'bg': '#1e1e1e',
            'fg': '#d4d4d4',
            'accent': '#569cd6',
            'success': '#4ec9b0',
            'error': '#f14c4c',
            'warning': '#dcdcaa',
            'button': '#0e639c',
            'button_hover': '#1177bb'
        }
        
        self.root.configure(bg=self.colors['bg'])
        
        # Variablen
        self.is_building = False
        self.build_thread = None
        self.process = None
        self.log_file = None
        self.custom_icon_path = None
        self.custom_splash_images = []  # Liste für mehrere Splash-Bilder (Rotation)
        self.custom_installer_images = []  # Liste für mehrere Installer-Bilder (Rotation)
        
        # Projekt-Verzeichnis ermitteln (ein Ordner über bobderbaumeister)
        self.script_dir = Path(__file__).parent.absolute()
        self.project_dir = self.script_dir.parent
        
        # Standard App-Name aus package.json laden
        self.default_app_name = self.load_app_name()
        
        self.setup_ui()
        self.check_prerequisites()
        
        # Start log queue processor
        self.process_log_queue()
    
    def process_log_queue(self):
        """Verarbeitet Log-Nachrichten aus der Queue (läuft im Main-Thread)"""
        try:
            # Process all pending messages
            messages_processed = 0
            while True:
                try:
                    msg, tag = self.log_queue.get_nowait()
                    self._write_to_log(msg, tag)
                    messages_processed += 1
                except queue.Empty:
                    break
            
            # Force GUI update if we processed any messages
            if messages_processed > 0:
                self.root.update_idletasks()
        except tk.TclError:
            pass  # Widget might be destroyed
        finally:
            # Schedule next check in 50ms for more responsive updates
            try:
                self.root.after(50, self.process_log_queue)
            except tk.TclError:
                pass  # Window might be closing
    
    def _write_to_log(self, message, tag):
        """Schreibt direkt ins Log-Widget (nur vom Main-Thread aufrufen!)"""
        try:
            self.log_text.config(state=tk.NORMAL)
            timestamp = datetime.now().strftime('%H:%M:%S')
            self.log_text.insert(tk.END, f"[{timestamp}] {message}\n", tag)
            self.log_text.see(tk.END)
            self.log_text.config(state=tk.DISABLED)
        except tk.TclError:
            pass  # Widget might be destroyed
    
    def load_app_name(self):
        """Lädt den App-Namen aus package.json"""
        try:
            package_json = self.project_dir / 'package.json'
            if package_json.exists():
                with open(package_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('build', {}).get('productName', 'LTTH')
        except:
            pass
        return 'LTTH'
        
    def setup_ui(self):
        """Erstellt die Benutzeroberfläche"""
        
        # Stil konfigurieren
        style = ttk.Style()
        style.theme_use('clam')
        
        # Header
        header_frame = tk.Frame(self.root, bg=self.colors['bg'])
        header_frame.pack(fill=tk.X, padx=20, pady=10)
        
        title_label = tk.Label(
            header_frame, 
            text="🔨 Bob der Baumeister", 
            font=('Segoe UI', 24, 'bold'),
            bg=self.colors['bg'],
            fg=self.colors['accent']
        )
        title_label.pack(anchor=tk.W)
        
        subtitle_label = tk.Label(
            header_frame, 
            text="LTTH Electron Installer Builder", 
            font=('Segoe UI', 12),
            bg=self.colors['bg'],
            fg=self.colors['fg']
        )
        subtitle_label.pack(anchor=tk.W)
        
        # Info-Frame
        info_frame = tk.Frame(self.root, bg='#2d2d2d', relief=tk.FLAT)
        info_frame.pack(fill=tk.X, padx=20, pady=10)
        
        # Projekt-Pfad
        path_label = tk.Label(
            info_frame, 
            text=f"📁 Projekt: {self.project_dir}", 
            font=('Consolas', 10),
            bg='#2d2d2d',
            fg=self.colors['fg'],
            anchor=tk.W,
            padx=10,
            pady=5
        )
        path_label.pack(fill=tk.X)
        
        # Status-Anzeige
        self.status_var = tk.StringVar(value="⏸️ Bereit")
        self.status_label = tk.Label(
            info_frame, 
            textvariable=self.status_var, 
            font=('Segoe UI', 11, 'bold'),
            bg='#2d2d2d',
            fg=self.colors['warning'],
            anchor=tk.W,
            padx=10,
            pady=5
        )
        self.status_label.pack(fill=tk.X)
        
        # ========== KONFIGURATIONS-FRAME ==========
        config_frame = tk.LabelFrame(
            self.root, 
            text=" ⚙️ Build-Konfiguration ", 
            font=('Segoe UI', 10, 'bold'),
            bg=self.colors['bg'],
            fg=self.colors['fg']
        )
        config_frame.pack(fill=tk.X, padx=20, pady=10)
        
        # App-Name Eingabe
        name_frame = tk.Frame(config_frame, bg=self.colors['bg'])
        name_frame.pack(fill=tk.X, padx=10, pady=5)
        
        name_label = tk.Label(
            name_frame,
            text="📝 App-Name (EXE):",
            font=('Segoe UI', 10),
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            width=18,
            anchor=tk.W
        )
        name_label.pack(side=tk.LEFT)
        
        self.app_name_var = tk.StringVar(value=self.default_app_name)
        self.app_name_entry = tk.Entry(
            name_frame,
            textvariable=self.app_name_var,
            font=('Segoe UI', 10),
            bg='#3c3c3c',
            fg='white',
            insertbackground='white',
            relief=tk.FLAT,
            width=40
        )
        self.app_name_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        
        name_hint = tk.Label(
            name_frame,
            text="(z.B. 'MeineTolleApp')",
            font=('Segoe UI', 9),
            bg=self.colors['bg'],
            fg='#808080'
        )
        name_hint.pack(side=tk.LEFT, padx=5)
        
        # Icon-Auswahl
        icon_frame = tk.Frame(config_frame, bg=self.colors['bg'])
        icon_frame.pack(fill=tk.X, padx=10, pady=5)
        
        icon_label = tk.Label(
            icon_frame,
            text="🖼️ App-Icon (PNG):",
            font=('Segoe UI', 10),
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            width=18,
            anchor=tk.W
        )
        icon_label.pack(side=tk.LEFT)
        
        self.icon_path_var = tk.StringVar(value="Standard-Icon verwenden")
        self.icon_path_label = tk.Label(
            icon_frame,
            textvariable=self.icon_path_var,
            font=('Segoe UI', 10),
            bg='#3c3c3c',
            fg='#a0a0a0',
            anchor=tk.W,
            padx=10,
            width=35
        )
        self.icon_path_label.pack(side=tk.LEFT, padx=5)
        
        self.icon_button = tk.Button(
            icon_frame,
            text="📂 PNG wählen...",
            font=('Segoe UI', 9),
            bg='#0e639c',
            fg='white',
            relief=tk.FLAT,
            padx=10,
            cursor='hand2',
            command=self.select_icon
        )
        self.icon_button.pack(side=tk.LEFT, padx=5)
        
        self.icon_clear_button = tk.Button(
            icon_frame,
            text="❌",
            font=('Segoe UI', 9),
            bg='#5a5a5a',
            fg='white',
            relief=tk.FLAT,
            padx=5,
            cursor='hand2',
            command=self.clear_icon
        )
        self.icon_clear_button.pack(side=tk.LEFT)
        
        # Icon-Vorschau
        self.icon_preview_frame = tk.Frame(config_frame, bg=self.colors['bg'])
        self.icon_preview_frame.pack(fill=tk.X, padx=10, pady=5)
        
        # Splash Screen Bilder-Auswahl (mehrere für Rotation)
        splash_frame = tk.Frame(config_frame, bg=self.colors['bg'])
        splash_frame.pack(fill=tk.X, padx=10, pady=5)
        
        splash_label = tk.Label(
            splash_frame,
            text="🖼️ Splash-Bilder:",
            font=('Segoe UI', 10),
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            width=18,
            anchor=tk.W
        )
        splash_label.pack(side=tk.LEFT)
        
        self.splash_path_var = tk.StringVar(value="Keine Bilder ausgewählt")
        self.splash_path_label = tk.Label(
            splash_frame,
            textvariable=self.splash_path_var,
            font=('Segoe UI', 10),
            bg='#3c3c3c',
            fg='#a0a0a0',
            anchor=tk.W,
            padx=10,
            width=35
        )
        self.splash_path_label.pack(side=tk.LEFT, padx=5)
        
        self.splash_button = tk.Button(
            splash_frame,
            text="📂 PNGs wählen...",
            font=('Segoe UI', 9),
            bg='#0e639c',
            fg='white',
            relief=tk.FLAT,
            padx=10,
            cursor='hand2',
            command=self.select_splash_images
        )
        self.splash_button.pack(side=tk.LEFT, padx=5)
        
        self.splash_clear_button = tk.Button(
            splash_frame,
            text="❌",
            font=('Segoe UI', 9),
            bg='#5a5a5a',
            fg='white',
            relief=tk.FLAT,
            padx=5,
            cursor='hand2',
            command=self.clear_splash_images
        )
        self.splash_clear_button.pack(side=tk.LEFT)
        
        # Splash Hinweis
        splash_hint_frame = tk.Frame(config_frame, bg=self.colors['bg'])
        splash_hint_frame.pack(fill=tk.X, padx=10, pady=2)
        
        splash_hint = tk.Label(
            splash_hint_frame,
            text="   (960x540 PNG empfohlen - mehrere Bilder rotieren während des Ladens)",
            font=('Segoe UI', 9),
            bg=self.colors['bg'],
            fg='#808080'
        )
        splash_hint.pack(anchor=tk.W)
        
        # Installer-Grafiken Auswahl (mehrere für Rotation)
        installer_bg_frame = tk.Frame(config_frame, bg=self.colors['bg'])
        installer_bg_frame.pack(fill=tk.X, padx=10, pady=5)
        
        installer_bg_label = tk.Label(
            installer_bg_frame,
            text="🖥️ Installer-Bilder:",
            font=('Segoe UI', 10),
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            width=18,
            anchor=tk.W
        )
        installer_bg_label.pack(side=tk.LEFT)
        
        self.installer_bg_path_var = tk.StringVar(value="Keine Bilder ausgewählt")
        self.installer_bg_path_label = tk.Label(
            installer_bg_frame,
            textvariable=self.installer_bg_path_var,
            font=('Segoe UI', 10),
            bg='#3c3c3c',
            fg='#a0a0a0',
            anchor=tk.W,
            padx=10,
            width=35
        )
        self.installer_bg_path_label.pack(side=tk.LEFT, padx=5)
        
        self.installer_bg_button = tk.Button(
            installer_bg_frame,
            text="📂 BMPs wählen...",
            font=('Segoe UI', 9),
            bg='#0e639c',
            fg='white',
            relief=tk.FLAT,
            padx=10,
            cursor='hand2',
            command=self.select_installer_images
        )
        self.installer_bg_button.pack(side=tk.LEFT, padx=5)
        
        self.installer_bg_clear_button = tk.Button(
            installer_bg_frame,
            text="❌",
            font=('Segoe UI', 9),
            bg='#5a5a5a',
            fg='white',
            relief=tk.FLAT,
            padx=5,
            cursor='hand2',
            command=self.clear_installer_images
        )
        self.installer_bg_clear_button.pack(side=tk.LEFT)
        
        # Installer Grafik Hinweis
        installer_hint_frame = tk.Frame(config_frame, bg=self.colors['bg'])
        installer_hint_frame.pack(fill=tk.X, padx=10, pady=2)
        
        installer_hint = tk.Label(
            installer_hint_frame,
            text="   (164x314 BMP empfohlen - mehrere Bilder rotieren während Installation)",
            font=('Segoe UI', 9),
            bg=self.colors['bg'],
            fg='#808080'
        )
        installer_hint.pack(anchor=tk.W)
        
        # ========== CODE SIGNING FRAME (Certum) ==========
        signing_frame = tk.LabelFrame(
            self.root, 
            text=" 🔐 Code Signing (Certum) - Optional ", 
            font=('Segoe UI', 10, 'bold'),
            bg=self.colors['bg'],
            fg=self.colors['fg']
        )
        signing_frame.pack(fill=tk.X, padx=20, pady=10)
        
        # Signing aktivieren Checkbox
        self.signing_enabled_var = tk.BooleanVar(value=False)
        signing_enable_frame = tk.Frame(signing_frame, bg=self.colors['bg'])
        signing_enable_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.signing_checkbox = tk.Checkbutton(
            signing_enable_frame,
            text="Code Signing aktivieren",
            variable=self.signing_enabled_var,
            font=('Segoe UI', 10),
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            selectcolor='#3c3c3c',
            activebackground=self.colors['bg'],
            activeforeground=self.colors['fg'],
            command=self.toggle_signing_fields
        )
        self.signing_checkbox.pack(side=tk.LEFT)
        
        signing_hint = tk.Label(
            signing_enable_frame,
            text="(Certum SimplySign Zertifikat erforderlich)",
            font=('Segoe UI', 9),
            bg=self.colors['bg'],
            fg='#808080'
        )
        signing_hint.pack(side=tk.LEFT, padx=10)
        
        # Container für Signing-Felder
        self.signing_fields_frame = tk.Frame(signing_frame, bg=self.colors['bg'])
        self.signing_fields_frame.pack(fill=tk.X, padx=10, pady=5)
        
        # CSC_LINK (Pfad zur .p12/.pfx Datei)
        csc_link_frame = tk.Frame(self.signing_fields_frame, bg=self.colors['bg'])
        csc_link_frame.pack(fill=tk.X, pady=3)
        
        csc_link_label = tk.Label(
            csc_link_frame,
            text="📜 CSC_LINK:",
            font=('Segoe UI', 10),
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            width=18,
            anchor=tk.W
        )
        csc_link_label.pack(side=tk.LEFT)
        
        self.csc_link_var = tk.StringVar()
        self.csc_link_entry = tk.Entry(
            csc_link_frame,
            textvariable=self.csc_link_var,
            font=('Consolas', 9),
            bg='#3c3c3c',
            fg='white',
            insertbackground='white',
            relief=tk.FLAT,
            width=50,
            state=tk.DISABLED
        )
        self.csc_link_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        
        self.csc_link_button = tk.Button(
            csc_link_frame,
            text="📂",
            font=('Segoe UI', 9),
            bg='#5a5a5a',
            fg='white',
            relief=tk.FLAT,
            padx=5,
            cursor='hand2',
            command=self.select_certificate,
            state=tk.DISABLED
        )
        self.csc_link_button.pack(side=tk.LEFT, padx=2)
        
        # CSC_KEY_PASSWORD
        csc_pass_frame = tk.Frame(self.signing_fields_frame, bg=self.colors['bg'])
        csc_pass_frame.pack(fill=tk.X, pady=3)
        
        csc_pass_label = tk.Label(
            csc_pass_frame,
            text="🔑 CSC_KEY_PASSWORD:",
            font=('Segoe UI', 10),
            bg=self.colors['bg'],
            fg=self.colors['fg'],
            width=18,
            anchor=tk.W
        )
        csc_pass_label.pack(side=tk.LEFT)
        
        self.csc_password_var = tk.StringVar()
        self.csc_password_entry = tk.Entry(
            csc_pass_frame,
            textvariable=self.csc_password_var,
            font=('Consolas', 9),
            bg='#3c3c3c',
            fg='white',
            insertbackground='white',
            relief=tk.FLAT,
            width=50,
            show='●',
            state=tk.DISABLED
        )
        self.csc_password_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        
        self.show_pass_var = tk.BooleanVar(value=False)
        self.show_pass_button = tk.Checkbutton(
            csc_pass_frame,
            text="👁",
            variable=self.show_pass_var,
            font=('Segoe UI', 9),
            bg=self.colors['bg'],
            fg='white',
            selectcolor='#3c3c3c',
            command=self.toggle_password_visibility,
            state=tk.DISABLED
        )
        self.show_pass_button.pack(side=tk.LEFT, padx=2)
        
        # Signing Info
        signing_info_frame = tk.Frame(self.signing_fields_frame, bg=self.colors['bg'])
        signing_info_frame.pack(fill=tk.X, pady=5)
        
        signing_info = tk.Label(
            signing_info_frame,
            text="ℹ️ Für Certum SimplySign: Lade das Zertifikat als .pfx/.p12 Datei herunter.\n"
                 "   Der Code wird beim Build automatisch signiert.",
            font=('Segoe UI', 9),
            bg=self.colors['bg'],
            fg='#808080',
            justify=tk.LEFT
        )
        signing_info.pack(anchor=tk.W)
        
        # Voraussetzungen Frame
        prereq_frame = tk.LabelFrame(
            self.root, 
            text=" Voraussetzungen ", 
            font=('Segoe UI', 10, 'bold'),
            bg=self.colors['bg'],
            fg=self.colors['fg']
        )
        prereq_frame.pack(fill=tk.X, padx=20, pady=10)
        
        self.prereq_labels = {}
        for item in ['Node.js', 'npm', 'SimplySign', 'Projekt-Dateien']:
            frame = tk.Frame(prereq_frame, bg=self.colors['bg'])
            frame.pack(fill=tk.X, padx=10, pady=2)
            
            self.prereq_labels[item] = tk.Label(
                frame, 
                text=f"⏳ {item}: Prüfe...", 
                font=('Segoe UI', 10),
                bg=self.colors['bg'],
                fg=self.colors['fg'],
                anchor=tk.W
            )
            self.prereq_labels[item].pack(side=tk.LEFT)
        
        # Button-Frame
        button_frame = tk.Frame(self.root, bg=self.colors['bg'])
        button_frame.pack(fill=tk.X, padx=20, pady=10)
        
        self.build_button = tk.Button(
            button_frame,
            text="🚀 BUILD STARTEN",
            font=('Segoe UI', 14, 'bold'),
            bg=self.colors['button'],
            fg='white',
            activebackground=self.colors['button_hover'],
            activeforeground='white',
            relief=tk.FLAT,
            padx=30,
            pady=10,
            cursor='hand2',
            command=self.start_build
        )
        self.build_button.pack(side=tk.LEFT, padx=5)
        
        self.stop_button = tk.Button(
            button_frame,
            text="⏹️ ABBRECHEN",
            font=('Segoe UI', 12),
            bg='#5a5a5a',
            fg='white',
            activebackground=self.colors['error'],
            activeforeground='white',
            relief=tk.FLAT,
            padx=20,
            pady=10,
            cursor='hand2',
            command=self.stop_build,
            state=tk.DISABLED
        )
        self.stop_button.pack(side=tk.LEFT, padx=5)
        
        self.open_dist_button = tk.Button(
            button_frame,
            text="📂 dist-Ordner öffnen",
            font=('Segoe UI', 10),
            bg='#3c3c3c',
            fg='white',
            relief=tk.FLAT,
            padx=15,
            pady=10,
            cursor='hand2',
            command=self.open_dist_folder
        )
        self.open_dist_button.pack(side=tk.RIGHT, padx=5)
        
        # Fortschrittsbalken
        self.progress = ttk.Progressbar(
            self.root, 
            mode='indeterminate',
            length=300
        )
        self.progress.pack(fill=tk.X, padx=20, pady=5)
        
        # Log-Bereich
        log_frame = tk.LabelFrame(
            self.root, 
            text=" Build-Log ", 
            font=('Segoe UI', 10, 'bold'),
            bg=self.colors['bg'],
            fg=self.colors['fg']
        )
        log_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            font=('Consolas', 10),
            bg='#1e1e1e',
            fg='#d4d4d4',
            insertbackground='white',
            wrap=tk.WORD,
            state=tk.DISABLED
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Tags für farbige Ausgabe
        self.log_text.tag_configure('info', foreground='#d4d4d4')
        self.log_text.tag_configure('success', foreground='#4ec9b0')
        self.log_text.tag_configure('error', foreground='#f14c4c')
        self.log_text.tag_configure('warning', foreground='#dcdcaa')
        self.log_text.tag_configure('step', foreground='#569cd6', font=('Consolas', 10, 'bold'))
        
        # Footer
        footer_frame = tk.Frame(self.root, bg=self.colors['bg'])
        footer_frame.pack(fill=tk.X, padx=20, pady=5)
        
        footer_label = tk.Label(
            footer_frame, 
            text="💡 Tipp: Log-Datei wird automatisch in bobderbaumeister/logs/ gespeichert", 
            font=('Segoe UI', 9),
            bg=self.colors['bg'],
            fg='#808080'
        )
        footer_label.pack(anchor=tk.W)
    
    def select_icon(self):
        """Öffnet einen Dateidialog zur Icon-Auswahl"""
        file_path = filedialog.askopenfilename(
            title="PNG-Icon auswählen",
            filetypes=[("PNG Dateien", "*.png"), ("Alle Dateien", "*.*")],
            initialdir=self.project_dir
        )
        
        if file_path:
            self.custom_icon_path = Path(file_path)
            # Kurzen Dateinamen anzeigen
            short_name = self.custom_icon_path.name
            if len(short_name) > 30:
                short_name = "..." + short_name[-27:]
            self.icon_path_var.set(short_name)
            self.icon_path_label.config(fg='#4ec9b0')
            self.log(f"Icon ausgewählt: {file_path}", 'success')
    
    def clear_icon(self):
        """Setzt das Icon zurück auf Standard"""
        self.custom_icon_path = None
        self.icon_path_var.set("Standard-Icon verwenden")
        self.icon_path_label.config(fg='#a0a0a0')
    
    def select_splash_images(self):
        """Öffnet einen Dateidialog zur Auswahl mehrerer Splash-Bilder"""
        file_paths = filedialog.askopenfilenames(
            title="Splash-Bilder auswählen (960x540 empfohlen) - Mehrfachauswahl möglich",
            filetypes=[("PNG Dateien", "*.png"), ("JPEG Dateien", "*.jpg *.jpeg"), ("Alle Dateien", "*.*")],
            initialdir=self.project_dir
        )
        
        if file_paths:
            self.custom_splash_images = [Path(p) for p in file_paths]
            count = len(self.custom_splash_images)
            self.splash_path_var.set(f"{count} Bild(er) ausgewählt")
            self.splash_path_label.config(fg='#4ec9b0')
            self.log(f"{count} Splash-Bild(er) ausgewählt - werden während des Ladens rotieren", 'success')
    
    def clear_splash_images(self):
        """Setzt die Splash-Bilder zurück"""
        self.custom_splash_images = []
        self.splash_path_var.set("Keine Bilder ausgewählt")
        self.splash_path_label.config(fg='#a0a0a0')
    
    def select_installer_images(self):
        """Öffnet einen Dateidialog zur Auswahl mehrerer Installer-Bilder"""
        file_paths = filedialog.askopenfilenames(
            title="Installer-Bilder auswählen (164x314 BMP empfohlen) - Mehrfachauswahl möglich",
            filetypes=[("BMP Dateien", "*.bmp"), ("PNG Dateien", "*.png"), ("Alle Dateien", "*.*")],
            initialdir=self.project_dir
        )
        
        if file_paths:
            self.custom_installer_images = [Path(p) for p in file_paths]
            count = len(self.custom_installer_images)
            self.installer_bg_path_var.set(f"{count} Bild(er) ausgewählt")
            self.installer_bg_path_label.config(fg='#4ec9b0')
            self.log(f"{count} Installer-Bild(er) ausgewählt - werden während der Installation rotieren", 'success')
    
    def clear_installer_images(self):
        """Setzt die Installer-Bilder zurück"""
        self.custom_installer_images = []
        self.installer_bg_path_var.set("Keine Bilder ausgewählt")
        self.installer_bg_path_label.config(fg='#a0a0a0')
    
    def toggle_signing_fields(self):
        """Aktiviert/Deaktiviert die Code Signing Felder"""
        enabled = self.signing_enabled_var.get()
        state = tk.NORMAL if enabled else tk.DISABLED
        
        self.csc_link_entry.config(state=state)
        self.csc_link_button.config(state=state)
        self.csc_password_entry.config(state=state)
        self.show_pass_button.config(state=state)
        
        if enabled:
            self.log("Code Signing aktiviert", 'info')
        else:
            self.log("Code Signing deaktiviert", 'info')
    
    def select_certificate(self):
        """Öffnet einen Dateidialog zur Zertifikatsauswahl"""
        file_path = filedialog.askopenfilename(
            title="Zertifikat auswählen (.pfx/.p12)",
            filetypes=[
                ("Zertifikate", "*.pfx *.p12"),
                ("PFX Dateien", "*.pfx"),
                ("P12 Dateien", "*.p12"),
                ("Alle Dateien", "*.*")
            ],
            initialdir=self.project_dir
        )
        
        if file_path:
            self.csc_link_var.set(file_path)
            self.log(f"Zertifikat ausgewählt: {file_path}", 'success')
    
    def toggle_password_visibility(self):
        """Zeigt/Versteckt das Passwort"""
        if self.show_pass_var.get():
            self.csc_password_entry.config(show='')
        else:
            self.csc_password_entry.config(show='●')
        
    def apply_config_to_package_json(self):
        """Wendet die Konfiguration auf package.json an"""
        try:
            package_json_path = self.project_dir / 'package.json'
            
            with open(package_json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # App-Name setzen
            app_name = self.app_name_var.get().strip()
            if app_name:
                if 'build' not in data:
                    data['build'] = {}
                data['build']['productName'] = app_name
                data['build']['appId'] = f"com.pupcid.{app_name.lower().replace(' ', '-')}"
                self.log(f"App-Name gesetzt: {app_name}", 'success')
            
            # Speichern
            with open(package_json_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            return True
        except Exception as e:
            self.log(f"Fehler beim Aktualisieren der package.json: {e}", 'error')
            return False
    
    def process_custom_icon(self):
        """Verarbeitet das benutzerdefinierte Icon"""
        if not self.custom_icon_path or not self.custom_icon_path.exists():
            return True  # Kein benutzerdefiniertes Icon, ok
        
        try:
            # Zielordner
            assets_dir = self.project_dir / 'electron' / 'assets' / 'icons'
            assets_dir.mkdir(parents=True, exist_ok=True)
            
            # PNG kopieren
            target_png = assets_dir / 'icon.png'
            shutil.copy2(self.custom_icon_path, target_png)
            self.log(f"Icon kopiert nach: {target_png}", 'success')
            
            # electron-builder.yml aktualisieren
            builder_yml = self.project_dir / 'electron' / 'electron-builder.yml'
            if builder_yml.exists():
                with open(builder_yml, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Icon-Pfad aktualisieren (falls nötig)
                # electron-builder erkennt icon.png automatisch im assets/icons Ordner
                self.log("Icon wird für den Build verwendet", 'success')
            
            return True
        except Exception as e:
            self.log(f"Fehler beim Verarbeiten des Icons: {e}", 'error')
            return False
    
    def process_splash_images(self):
        """Verarbeitet die benutzerdefinierten Splash-Bilder (mit Rotation)"""
        if not self.custom_splash_images:
            return True  # Keine benutzerdefinierten Bilder, ok
        
        try:
            # Zielordner - Splash-Verzeichnis
            splash_dir = self.project_dir / 'electron' / 'splash'
            splash_dir.mkdir(parents=True, exist_ok=True)
            
            # Bilder kopieren mit nummeriertem Namen
            image_count = len(self.custom_splash_images)
            for i, img_path in enumerate(self.custom_splash_images):
                if img_path.exists():
                    target = splash_dir / f'splash-bg-{i}.png'
                    shutil.copy2(img_path, target)
                    self.log(f"   Splash-Bild {i+1}/{image_count} kopiert", 'info')
            
            self.log(f"{image_count} Splash-Bild(er) in {splash_dir} kopiert", 'success')
            
            # Neues Splash-HTML mit Bild-Rotation generieren
            self.generate_splash_html_with_rotation(splash_dir, image_count)
            
            return True
        except Exception as e:
            self.log(f"Fehler beim Verarbeiten der Splash-Bilder: {e}", 'error')
            return False
    
    def generate_splash_html_with_rotation(self, splash_dir, image_count):
        """Generiert ein neues Splash-HTML mit Bild-Rotation (Bild oben, Logs unten)"""
        # Generiere JavaScript Array mit Bildnamen
        images_js = ', '.join([f"'splash-bg-{i}.png'" for i in range(image_count)])
        
        html_content = f'''<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LTTH Launcher</title>
  <style>
    * {{
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }}
    
    body {{
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #1a1a2e;
      color: #e4e4e4;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      user-select: none;
      -webkit-app-region: drag;
    }}
    
    .image-container {{
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #0f0f1a;
      position: relative;
    }}
    
    .splash-image {{
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      transition: opacity 0.5s ease-in-out;
    }}
    
    .splash-image.fade-out {{
      opacity: 0;
    }}
    
    .loading-section {{
      height: 200px;
      display: flex;
      flex-direction: column;
      background: rgba(0,0,0,0.3);
      border-top: 1px solid rgba(255,255,255,0.1);
    }}
    
    .status-container {{
      padding: 10px 15px;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }}
    
    .status {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    
    .spinner {{
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #00d2ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }}
    
    .spinner.hidden {{
      display: none;
    }}
    
    @keyframes spin {{
      to {{ transform: rotate(360deg); }}
    }}
    
    .status-text {{
      font-size: 13px;
      color: #00d2ff;
    }}
    
    .status-text.success {{ color: #4ade80; }}
    .status-text.error {{ color: #f87171; }}
    .status-text.warning {{ color: #fbbf24; }}
    
    .logs-container {{
      flex: 1;
      padding: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }}
    
    .logs {{
      flex: 1;
      background: rgba(0,0,0,0.4);
      border-radius: 6px;
      padding: 8px;
      overflow-y: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 10px;
      line-height: 1.4;
      -webkit-app-region: no-drag;
    }}
    
    .logs::-webkit-scrollbar {{
      width: 5px;
    }}
    
    .logs::-webkit-scrollbar-track {{
      background: rgba(255,255,255,0.05);
      border-radius: 3px;
    }}
    
    .logs::-webkit-scrollbar-thumb {{
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
    }}
    
    .log-line {{
      padding: 1px 0;
      word-break: break-all;
    }}
    
    .log-line.stdout {{ color: #a0a0a0; }}
    .log-line.stderr {{ color: #f87171; }}
    .log-line.info {{ color: #60a5fa; }}
    .log-line.success {{ color: #4ade80; }}
    .log-line.error {{ color: #f87171; }}
    .log-line.warning {{ color: #fbbf24; }}
    
    .footer {{
      padding: 5px 15px;
      text-align: center;
      font-size: 9px;
      color: #555;
      background: rgba(0,0,0,0.2);
    }}
  </style>
</head>
<body>
  <div class="image-container">
    <img class="splash-image" id="splash-image" src="splash-bg-0.png" alt="Loading">
  </div>
  
  <div class="loading-section">
    <div class="status-container">
      <div class="status">
        <div class="spinner" id="spinner"></div>
        <div class="status-text" id="status-text">Initialisiere...</div>
      </div>
    </div>
    
    <div class="logs-container">
      <div class="logs" id="logs">
        <div class="log-line info">[System] Starte...</div>
      </div>
    </div>
    
    <div class="footer">
      <span class="version" id="version">Version wird geladen...</span>
    </div>
  </div>
  
  <script>
    const logsContainer = document.getElementById('logs');
    const statusText = document.getElementById('status-text');
    const spinner = document.getElementById('spinner');
    const versionEl = document.getElementById('version');
    const splashImage = document.getElementById('splash-image');
    
    // Bild-Rotation
    const images = [{images_js}];
    let currentImageIndex = 0;
    
    function rotateImage() {{
      if (images.length > 1) {{
        splashImage.classList.add('fade-out');
        setTimeout(() => {{
          currentImageIndex = (currentImageIndex + 1) % images.length;
          splashImage.src = images[currentImageIndex];
          splashImage.classList.remove('fade-out');
        }}, 500);
      }}
    }}
    
    // Alle 3 Sekunden das Bild wechseln
    if (images.length > 1) {{
      setInterval(rotateImage, 3000);
    }}
    
    // Receive status updates from main process
    window.electronAPI.onSplashStatus((data) => {{
      statusText.textContent = data.message;
      statusText.className = 'status-text ' + (data.type || 'info');
      
      if (data.type === 'success' || data.type === 'error') {{
        spinner.classList.add('hidden');
      }} else {{
        spinner.classList.remove('hidden');
      }}
      
      addLog(data.message, data.type || 'info');
    }});
    
    // Receive backend logs
    window.electronAPI.onBackendLog((data) => {{
      addLog('[Backend] ' + data.message, data.type === 'stderr' ? 'error' : 'stdout');
    }});
    
    // Get version
    window.electronAPI.getVersion().then(version => {{
      versionEl.textContent = 'Version ' + version;
    }});
    
    function addLog(message, type) {{
      type = type || 'info';
      const line = document.createElement('div');
      line.className = 'log-line ' + type;
      line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
      logsContainer.appendChild(line);
      logsContainer.scrollTop = logsContainer.scrollHeight;
      
      while (logsContainer.children.length > 100) {{
        logsContainer.removeChild(logsContainer.firstChild);
      }}
    }}
  </script>
</body>
</html>'''
        
        splash_html = splash_dir / 'index.html'
        with open(splash_html, 'w', encoding='utf-8') as f:
            f.write(html_content)
        self.log("Splash-HTML mit Bild-Rotation generiert", 'success')
    
    def process_installer_images(self):
        """Verarbeitet die benutzerdefinierten Installer-Bilder"""
        if not self.custom_installer_images:
            return True  # Keine benutzerdefinierten Bilder
        
        try:
            # Zielordner für Installer-Assets
            installer_dir = self.project_dir / 'electron' / 'assets' / 'installer'
            installer_dir.mkdir(parents=True, exist_ok=True)
            
            # Für NSIS: Erstes Bild als installerSidebar verwenden
            # (NSIS unterstützt keine animierten Bilder, aber wir können mehrere vorbereiten)
            for i, img_path in enumerate(self.custom_installer_images):
                if img_path.exists():
                    target = installer_dir / f'sidebar-{i}.bmp'
                    shutil.copy2(img_path, target)
                    
                    # Erstes Bild auch als Haupt-Sidebar
                    if i == 0:
                        main_target = installer_dir / 'installerSidebar.bmp'
                        shutil.copy2(img_path, main_target)
            
            self.log(f"{len(self.custom_installer_images)} Installer-Bild(er) kopiert", 'success')
            
            # electron-builder.yml aktualisieren um Sidebar zu verwenden
            self.update_builder_yml_for_installer_sidebar()
            
            return True
        except Exception as e:
            self.log(f"Fehler beim Verarbeiten der Installer-Bilder: {e}", 'error')
            return False
    
    def update_builder_yml_for_installer_sidebar(self):
        """Aktualisiert electron-builder.yml um die Installer-Sidebar zu nutzen"""
        try:
            builder_yml = self.project_dir / 'electron' / 'electron-builder.yml'
            if builder_yml.exists():
                with open(builder_yml, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Prüfen ob installerSidebar bereits konfiguriert ist
                if 'installerSidebar' not in content:
                    # Nach nsis: Section suchen und installerSidebar hinzufügen
                    nsis_section = 'nsis:'
                    if nsis_section in content:
                        # Füge installerSidebar nach nsis: ein
                        new_nsis = '''nsis:
  installerSidebar: electron/assets/installer/installerSidebar.bmp'''
                        content = content.replace(nsis_section, new_nsis)
                        
                        with open(builder_yml, 'w', encoding='utf-8') as f:
                            f.write(content)
                        self.log("electron-builder.yml für Installer-Sidebar aktualisiert", 'success')
        except Exception as e:
            self.log(f"Warnung: Konnte electron-builder.yml nicht aktualisieren: {e}", 'warning')
        
    def log(self, message, tag='info'):
        """Fügt eine Nachricht zum Log hinzu (thread-safe via Queue)"""
        # Put message in queue - will be processed by main thread
        self.log_queue.put((message, tag))
        
        # In Datei schreiben (thread-safe da eigene File-Operation)
        if self.log_file:
            try:
                with open(self.log_file, 'a', encoding='utf-8') as f:
                    timestamp = datetime.now().strftime('%H:%M:%S')
                    f.write(f"[{timestamp}] {message}\n")
            except:
                pass
                
    def set_status(self, status, color=None):
        """Setzt den Status-Text"""
        self.status_var.set(status)
        if color:
            self.status_label.config(fg=color)
            
    def check_prerequisites(self):
        """Prüft die Voraussetzungen"""
        def check():
            # Node.js prüfen
            try:
                result = subprocess.run(
                    ['node', '-v'], 
                    capture_output=True, 
                    text=True, 
                    timeout=10,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
                )
                if result.returncode == 0:
                    version = result.stdout.strip()
                    self.root.after(0, lambda v=version: self.prereq_labels['Node.js'].config(
                        text=f"✅ Node.js: {v}",
                        fg=self.colors['success']
                    ))
                else:
                    self.root.after(0, lambda: self.prereq_labels['Node.js'].config(
                        text="❌ Node.js: Nicht gefunden!",
                        fg=self.colors['error']
                    ))
            except Exception as e:
                error_msg = str(e)[:50]  # Show more of the error message
                self.root.after(0, lambda msg=error_msg: self.prereq_labels['Node.js'].config(
                    text=f"❌ Node.js: {msg}",
                    fg=self.colors['error']
                ))
            
            # npm prüfen
            try:
                # On Windows, use npm.cmd
                npm_cmd = ['npm.cmd', '-v'] if sys.platform == 'win32' else ['npm', '-v']
                result = subprocess.run(
                    npm_cmd, 
                    capture_output=True, 
                    text=True, 
                    timeout=10,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
                )
                if result.returncode == 0:
                    version = result.stdout.strip()
                    self.root.after(0, lambda v=version: self.prereq_labels['npm'].config(
                        text=f"✅ npm: {v}",
                        fg=self.colors['success']
                    ))
                else:
                    self.root.after(0, lambda: self.prereq_labels['npm'].config(
                        text="❌ npm: Nicht gefunden!",
                        fg=self.colors['error']
                    ))
            except Exception as e:
                error_msg = str(e)[:50]  # Show more of the error message
                self.root.after(0, lambda msg=error_msg: self.prereq_labels['npm'].config(
                    text=f"❌ npm: {msg}",
                    fg=self.colors['error']
                ))
            
            # SimplySign Cloud (HSM) Certificate prüfen
            simplysign_detected = False
            cert_subject_name = None
            
            if sys.platform == 'win32':
                try:
                    # Prüfe Windows Certificate Store auf Certum/SimplySign Zertifikate
                    result = subprocess.run(
                        ['powershell', '-Command', 
                         'Get-ChildItem -Path Cert:\\CurrentUser\\My | Where-Object {$_.Subject -like "*Certum*" -or $_.Issuer -like "*Certum*"} | Select-Object -First 1 | ForEach-Object {$_.Subject}'],
                        capture_output=True,
                        text=True,
                        timeout=10,
                        creationflags=subprocess.CREATE_NO_WINDOW
                    )
                    
                    if result.returncode == 0 and result.stdout.strip():
                        cert_info = result.stdout.strip()
                        # Extrahiere CN (Common Name) aus dem Subject
                        import re
                        cn_match = re.search(r'CN=([^,]+)', cert_info)
                        if cn_match:
                            # Bereinige den CN-Wert von Quotes und Whitespace
                            cert_subject_name = cn_match.group(1).strip().strip('"').strip("'").strip()
                            simplysign_detected = True
                            
                            self.root.after(0, lambda: self.prereq_labels.get('SimplySign', tk.Label()).config(
                                text=f"✅ SimplySign: {cert_subject_name}",
                                fg=self.colors['success']
                            ))
                            
                            # Auto-enable signing und setze den Subject Name
                            self.root.after(0, lambda: self.auto_configure_simplysign(cert_subject_name))
                        else:
                            self.root.after(0, lambda: self.prereq_labels.get('SimplySign', tk.Label()).config(
                                text="⚠️ SimplySign: Zertifikat gefunden, CN nicht erkannt",
                                fg=self.colors['warning']
                            ))
                    else:
                        self.root.after(0, lambda: self.prereq_labels.get('SimplySign', tk.Label()).config(
                            text="ℹ️ SimplySign: Kein Zertifikat gefunden",
                            fg='#808080'
                        ))
                except Exception as e:
                    # Kein Fehler anzeigen - SimplySign ist optional
                    pass
            
            # Projekt-Dateien prüfen
            package_json = self.project_dir / 'package.json'
            electron_main = self.project_dir / 'electron' / 'main.js'
            
            if package_json.exists() and electron_main.exists():
                self.root.after(0, lambda: self.prereq_labels['Projekt-Dateien'].config(
                    text="✅ Projekt-Dateien: Gefunden",
                    fg=self.colors['success']
                ))
            else:
                missing = []
                if not package_json.exists():
                    missing.append('package.json')
                if not electron_main.exists():
                    missing.append('electron/main.js')
                missing_str = ', '.join(missing)
                self.root.after(0, lambda ms=missing_str: self.prereq_labels['Projekt-Dateien'].config(
                    text=f"❌ Fehlt: {ms}",
                    fg=self.colors['error']
                ))
        
        # In separatem Thread ausführen
        threading.Thread(target=check, daemon=True).start()
    
    def auto_configure_simplysign(self, cert_subject_name):
        """Konfiguriert automatisch Code-Signierung für SimplySign Cloud HSM"""
        # Aktiviere Code-Signierung
        self.signing_enabled_var.set(True)
        self.toggle_signing_fields()
        
        # Setze CSC_LINK auf leer (SimplySign nutzt Windows Certificate Store)
        self.csc_link_var.set("")
        
        # Setze CSC_PASSWORD auf leer (nicht benötigt für SimplySign Cloud)
        self.csc_password_var.set("")
        
        # Log-Nachricht
        self.log("", 'info')
        self.log("🔐 SimplySign Cloud HSM erkannt!", 'success')
        self.log(f"   Zertifikat: {cert_subject_name}", 'info')
        self.log("   Code-Signierung automatisch aktiviert", 'success')
        self.log("   ⚠️ Wichtig: electron-builder.yml muss konfiguriert sein:", 'warning')
        self.log(f"      certificateSubjectName: \"{cert_subject_name}\"", 'info')
        self.log("   Bei Build wird SimplySign Mobile App 2FA anfordern", 'info')
        
        # Update electron-builder.yml mit dem Certificate Subject Name
        self.auto_update_electron_builder_yml(cert_subject_name)
    
    def auto_update_electron_builder_yml(self, cert_subject_name):
        """Aktualisiert electron-builder.yml automatisch mit Certificate Subject Name"""
        try:
            electron_builder_yml = self.project_dir / 'electron' / 'electron-builder.yml'
            
            if not electron_builder_yml.exists():
                self.log("   ⚠️ electron-builder.yml nicht gefunden - bitte manuell konfigurieren", 'warning')
                return
            
            # Bereinige den Certificate Subject Name von unerwünschten Zeichen
            # Entferne führende/abschließende Quotes und Whitespace
            clean_cert_name = cert_subject_name.strip().strip('"').strip("'").strip()
            
            # Lese die Datei
            with open(electron_builder_yml, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Prüfe ob bereits konfiguriert (mit bereinigtem Namen)
            if f'certificateSubjectName: "{clean_cert_name}"' in content:
                self.log("   ✅ electron-builder.yml bereits konfiguriert", 'success')
                return
            
            # Aktiviere signingHashAlgorithms und certificateSubjectName
            updated = False
            lines = content.split('\n')
            new_lines = []
            
            for i, line in enumerate(lines):
                # Entferne Kommentar vor signingHashAlgorithms
                if '# signingHashAlgorithms:' in line or '#signingHashAlgorithms:' in line:
                    new_lines.append('  signingHashAlgorithms: ["sha256"]')
                    updated = True
                # Entferne Kommentar und setze certificateSubjectName
                elif '# certificateSubjectName:' in line or '#certificateSubjectName:' in line:
                    new_lines.append(f'  certificateSubjectName: "{clean_cert_name}"')
                    updated = True
                else:
                    new_lines.append(line)
            
            if updated:
                # Schreibe Datei zurück
                with open(electron_builder_yml, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(new_lines))
                
                self.log("   ✅ electron-builder.yml automatisch konfiguriert", 'success')
                self.log(f"      → signingHashAlgorithms: [\"sha256\"]", 'info')
                self.log(f"      → certificateSubjectName: \"{clean_cert_name}\"", 'info')
            else:
                self.log("   ℹ️ electron-builder.yml keine Änderungen nötig", 'info')
                
        except Exception as e:
            self.log(f"   ⚠️ Fehler beim Aktualisieren von electron-builder.yml: {e}", 'warning')
            self.log("   Bitte manuell konfigurieren", 'info')
        
    def start_build(self):
        """Startet den Build-Prozess"""
        if self.is_building:
            return
            
        self.is_building = True
        self.build_button.config(state=tk.DISABLED)
        self.stop_button.config(state=tk.NORMAL)
        self.progress.start(10)
        
        # Log-Datei erstellen
        log_dir = self.script_dir / 'logs'
        log_dir.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        self.log_file = log_dir / f'build_{timestamp}.log'
        
        # Log leeren
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        
        self.log("=" * 60, 'step')
        self.log("🔨 LTTH Electron Installer Build gestartet", 'step')
        self.log("=" * 60, 'step')
        self.log(f"Projekt-Verzeichnis: {self.project_dir}")
        self.log(f"Log-Datei: {self.log_file}")
        self.log("")
        
        self.set_status("🔄 Build läuft...", self.colors['warning'])
        
        # Build in separatem Thread
        self.build_thread = threading.Thread(target=self.run_build, daemon=True)
        self.build_thread.start()
        
    def run_build(self):
        """Führt den Build-Prozess aus"""
        try:
            os.chdir(self.project_dir)
            
            # Schritt 0: Konfiguration anwenden
            self.log("", 'info')
            self.log("[0/6] ⚙️ Wende Build-Konfiguration an...", 'step')
            
            # App-Name in package.json schreiben
            if not self.apply_config_to_package_json():
                self.log("   Warnung: Konfiguration konnte nicht vollständig angewendet werden", 'warning')
            
            # Benutzerdefiniertes Icon verarbeiten
            if self.custom_icon_path:
                self.log(f"   Verarbeite Icon: {self.custom_icon_path.name}", 'info')
                if not self.process_custom_icon():
                    self.log("   Warnung: Icon konnte nicht verarbeitet werden", 'warning')
            else:
                self.log("   Verwende Standard-Icon", 'info')
            
            # Benutzerdefinierte Splash-Bilder verarbeiten
            if self.custom_splash_images:
                self.log(f"   Verarbeite {len(self.custom_splash_images)} Splash-Bild(er)...", 'info')
                if not self.process_splash_images():
                    self.log("   Warnung: Splash-Bilder konnten nicht verarbeitet werden", 'warning')
            else:
                self.log("   Verwende Standard-Splash-Screen", 'info')
            
            # Benutzerdefinierte Installer-Bilder verarbeiten
            if self.custom_installer_images:
                self.log(f"   Verarbeite {len(self.custom_installer_images)} Installer-Bild(er)...", 'info')
                if not self.process_installer_images():
                    self.log("   Warnung: Installer-Bilder konnten nicht verarbeitet werden", 'warning')
            else:
                self.log("   Verwende Standard-Installer-Grafik", 'info')
            
            # Schritt 1: Alte Builds löschen
            self.log("", 'info')
            self.log("[1/6] 🗑️ Lösche alte Build-Artefakte...", 'step')
            dist_dir = self.project_dir / 'dist'
            if dist_dir.exists():
                try:
                    shutil.rmtree(dist_dir, ignore_errors=True)
                    self.log("   dist-Ordner gelöscht", 'success')
                except Exception as e:
                    self.log(f"   Warnung: {e}", 'warning')
            else:
                self.log("   Kein alter dist-Ordner vorhanden", 'info')
            
            # Schritt 2: npm install
            self.log("", 'info')
            self.log("[2/6] 📦 Installiere Dependencies...", 'step')
            self.run_command(['npm', 'install'])
            
            # Schritt 3: App Dependencies (falls vorhanden)
            app_package = self.project_dir / 'app' / 'package.json'
            app_dir = self.project_dir / 'app'
            if app_package.exists():
                self.log("", 'info')
                self.log("[3/6] 📦 Installiere App Dependencies...", 'step')
                self.run_command(['npm', 'install'], cwd=app_dir)
            else:
                self.log("", 'info')
                self.log("[3/6] ⏭️ Keine App Dependencies", 'info')
            
            # Schritt 4: Rebuild native modules for Electron (CRITICAL!)
            self.log("", 'info')
            self.log("[4/6] 🔧 Rebuild native Modules für Electron...", 'step')
            self.log("   (Kompiliere better-sqlite3 für Electron Node-Version)", 'info')
            
            # CRITICAL: Native modules MUST be recompiled for Electron's Node.js version
            # Electron 33 uses Node.js v22 (ABI 130), but npm install compiles for system Node.js
            # Without this step, better-sqlite3 will crash with NODE_MODULE_VERSION mismatch
            
            # First, get the installed Electron version
            electron_version = None
            try:
                result = subprocess.run(
                    ['npx', 'electron', '--version'],
                    capture_output=True, text=True, cwd=str(self.project_dir), timeout=30
                )
                if result.returncode == 0:
                    electron_version = result.stdout.strip().lstrip('v')
                    self.log(f"   Electron Version: {electron_version}", 'info')
            except Exception as e:
                self.log(f"   ⚠️ Konnte Electron-Version nicht ermitteln: {e}", 'warning')
            
            rebuild_success = False
            
            # Method 1: Use @electron/rebuild with explicit version (most reliable)
            self.log("   Methode 1: @electron/rebuild mit expliziter Version...", 'info')
            rebuild_cmd = [
                'npx', '@electron/rebuild', 
                '-f',  # Force rebuild
                '-w', 'better-sqlite3',  # Only rebuild better-sqlite3
                '--module-dir', str(app_dir)  # Target app/ directory (containing package.json)
            ]
            if electron_version:
                rebuild_cmd.extend(['-v', electron_version])
            rebuild_success = self.run_command(rebuild_cmd)
            
            if not rebuild_success:
                # Method 2: Try electron-builder's install-app-deps
                self.log("   Methode 2: electron-builder install-app-deps...", 'info')
                rebuild_success = self.run_command([
                    'npx', 'electron-builder', 'install-app-deps'
                ])
            
            if not rebuild_success:
                # Method 3: Try from app directory with explicit version
                self.log("   Methode 3: Rebuild aus app/ Verzeichnis...", 'info')
                rebuild_cmd = ['npx', '@electron/rebuild', '-f', '-w', 'better-sqlite3']
                if electron_version:
                    rebuild_cmd.extend(['-v', electron_version])
                rebuild_success = self.run_command(rebuild_cmd, cwd=str(app_dir))
            
            if not rebuild_success:
                self.log("   ❌ KRITISCH: Native Module Rebuild fehlgeschlagen!", 'error')
                self.log("   ❌ Die App wird nicht starten ohne korrekt kompilierte native Module!", 'error')
                self.log("   ❌ Versuche manuell: cd app && npx @electron/rebuild -f -w better-sqlite3", 'error')
                # Don't continue - this WILL cause the app to fail
                return
            else:
                self.log("   ✅ Native Modules neu gebaut", 'success')
            
            # Verify the rebuild actually worked by checking the .node file timestamp
            better_sqlite_node = app_dir / 'node_modules' / 'better-sqlite3' / 'build' / 'Release' / 'better_sqlite3.node'
            if better_sqlite_node.exists():
                import time
                mtime = os.path.getmtime(better_sqlite_node)
                age_seconds = time.time() - mtime
                if age_seconds < 60:  # Modified in the last minute
                    self.log(f"   ✅ better_sqlite3.node wurde aktualisiert (vor {int(age_seconds)}s)", 'success')
                else:
                    self.log(f"   ⚠️ better_sqlite3.node ist {int(age_seconds/60)} Minuten alt - möglicherweise nicht neu gebaut!", 'warning')
            else:
                self.log("   ⚠️ better_sqlite3.node nicht gefunden - Rebuild möglicherweise fehlgeschlagen!", 'warning')
            
            # Schritt 5: Build (two-stage to ensure node_modules are included)
            self.log("", 'info')
            self.log("[5/6] 🔨 Baue Windows Installer...", 'step')
            self.log("   (Das kann einige Minuten dauern...)", 'info')
            
            # Code Signing Environment vorbereiten
            signing_env = {}
            if self.signing_enabled_var.get():
                csc_link = self.csc_link_var.get().strip()
                csc_password = self.csc_password_var.get()
                
                # SimplySign Cloud HSM: CSC_LINK und CSC_KEY_PASSWORD sind leer
                # electron-builder nutzt automatisch Windows Certificate Store
                if not csc_link and not csc_password:
                    self.log("   🔐 Code Signing aktiviert (SimplySign Cloud HSM)", 'success')
                    self.log("   → Nutzt Windows Certificate Store", 'info')
                    self.log("   → SimplySign Mobile App wird 2FA anfordern", 'info')
                    # Kein signing_env nötig - electron-builder verwendet automatisch 
                    # das Zertifikat aus dem Windows Certificate Store basierend auf 
                    # certificateSubjectName in electron-builder.yml
                elif csc_link and csc_password:
                    # Traditionelles Zertifikat (PFX-Datei)
                    signing_env['CSC_LINK'] = csc_link
                    signing_env['CSC_KEY_PASSWORD'] = csc_password
                    self.log("   🔐 Code Signing aktiviert (PFX-Datei)", 'success')
                else:
                    self.log("   ⚠️ Code Signing aktiviert aber unvollständig konfiguriert!", 'warning')
            
            # Stage 1: Build unpacked app (without installer)
            self.log("   [5a] Erstelle entpackte App...", 'info')
            success = self.run_command(['npx', 'electron-builder', '--win', '--dir'], extra_env=signing_env if signing_env else None)
            
            if success:
                # Stage 2: Verify and fix node_modules in unpacked app
                # electron-builder kann verschiedene Strukturen erstellen, daher suchen wir
                win_unpacked = dist_dir / 'win-unpacked'
                
                # Debug: Zeige die tatsächliche Verzeichnisstruktur
                self.log("   [5b] Prüfe Build-Struktur...", 'info')
                
                # Mögliche Pfade für node_modules
                possible_paths = [
                    win_unpacked / 'resources' / 'app' / 'app' / 'node_modules',  # Mit ASAR disabled, nested app
                    win_unpacked / 'resources' / 'app.asar.unpacked' / 'app' / 'node_modules',  # Mit ASAR
                    win_unpacked / 'resources' / 'app' / 'node_modules',  # Flache Struktur
                ]
                
                # Finde den tatsächlichen Pfad für app/
                actual_app_dir = None
                for base in [win_unpacked / 'resources' / 'app', win_unpacked / 'resources' / 'app.asar.unpacked']:
                    if base.exists():
                        # Suche nach server.js um das app-Verzeichnis zu finden
                        for server_path in base.rglob('server.js'):
                            actual_app_dir = server_path.parent
                            self.log(f"   [5b] App-Verzeichnis gefunden: {actual_app_dir}", 'info')
                            break
                        if actual_app_dir:
                            break
                
                source_nm = self.project_dir / 'app' / 'node_modules'
                
                if actual_app_dir:
                    win_unpacked_nm = actual_app_dir / 'node_modules'
                    dotenv_exists = (win_unpacked_nm / 'dotenv').exists()
                    
                    # Kopiere node_modules wenn es fehlt ODER wenn dotenv nicht vorhanden ist
                    if source_nm.exists() and (not win_unpacked_nm.exists() or not dotenv_exists):
                        reason = "fehlt" if not win_unpacked_nm.exists() else "unvollständig (dotenv fehlt)"
                        self.log(f"   [5b] ⚠️ node_modules {reason} - kopiere...", 'warning')
                        try:
                            if win_unpacked_nm.exists():
                                shutil.rmtree(win_unpacked_nm, ignore_errors=True)
                            win_unpacked_nm.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copytree(source_nm, win_unpacked_nm, dirs_exist_ok=True)
                            self.log(f"   [5b] ✅ node_modules kopiert nach: {win_unpacked_nm}", 'success')
                        except Exception as e:
                            self.log(f"   [5b] ❌ Kopieren fehlgeschlagen: {e}", 'error')
                            success = False
                    elif win_unpacked_nm.exists() and dotenv_exists:
                        self.log("   [5b] ✅ node_modules vollständig vorhanden", 'success')
                    else:
                        self.log("   [5b] ⚠️ Quelle app/node_modules existiert nicht!", 'warning')
                else:
                    self.log("   [5b] ⚠️ Konnte App-Verzeichnis nicht finden - versuche Standard-Pfad", 'warning')
                    # Fallback zu Standard-Pfad
                    win_unpacked_nm = dist_dir / 'win-unpacked' / 'resources' / 'app' / 'app' / 'node_modules'
                    dotenv_exists = (win_unpacked_nm / 'dotenv').exists()
                    
                    if source_nm.exists() and (not win_unpacked_nm.exists() or not dotenv_exists):
                        reason = "fehlt" if not win_unpacked_nm.exists() else "unvollständig (dotenv fehlt)"
                        self.log(f"   [5b] ⚠️ node_modules {reason} - kopiere...", 'warning')
                        try:
                            if win_unpacked_nm.exists():
                                shutil.rmtree(win_unpacked_nm, ignore_errors=True)
                            win_unpacked_nm.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copytree(source_nm, win_unpacked_nm, dirs_exist_ok=True)
                            self.log(f"   [5b] ✅ node_modules kopiert nach: {win_unpacked_nm}", 'success')
                        except Exception as e:
                            self.log(f"   [5b] ❌ Kopieren fehlgeschlagen: {e}", 'error')
                            success = False
                
                # Stage 3: CRITICAL - Rebuild native modules IN the unpacked directory
                # This is necessary because electron-builder may have re-downloaded or corrupted the native modules
                if success and actual_app_dir:
                    self.log("   [5c] 🔧 Rebuild native Module im gepackten Verzeichnis...", 'info')
                    
                    # Get Electron version again if needed
                    if not electron_version:
                        try:
                            result = subprocess.run(
                                ['npx', 'electron', '--version'],
                                capture_output=True, text=True, cwd=str(self.project_dir), timeout=30
                            )
                            if result.returncode == 0:
                                electron_version = result.stdout.strip().lstrip('v')
                        except:
                            pass
                    
                    rebuild_cmd = [
                        'npx', '@electron/rebuild',
                        '-f',
                        '-w', 'better-sqlite3',
                        '--module-dir', str(actual_app_dir)  # Target directory containing package.json
                    ]
                    if electron_version:
                        rebuild_cmd.extend(['-v', electron_version])
                        self.log(f"   Electron Version für Rebuild: {electron_version}", 'info')
                    
                    rebuild_packed = self.run_command(rebuild_cmd)
                    if rebuild_packed:
                        self.log("   [5c] ✅ Native Module im gepackten Verzeichnis neu gebaut", 'success')
                    else:
                        self.log("   [5c] ⚠️ Rebuild im gepackten Verzeichnis fehlgeschlagen", 'warning')
                        self.log("   [5c] ⚠️ Die App könnte den NODE_MODULE_VERSION Fehler haben!", 'warning')
                
                # Stage 4: Create NSIS installer from the (now complete) unpacked app
                if success:
                    self.log("   [5d] Erstelle NSIS Installer...", 'info')
                    # Use --prepackaged to build from existing win-unpacked folder
                    prepackaged_dir = str(dist_dir / 'win-unpacked')
                    success = self.run_command(['npx', 'electron-builder', '--win', 'nsis', '--prepackaged', prepackaged_dir], extra_env=signing_env if signing_env else None)
            
            if success:
                self.log("", 'info')
                self.log("[6/6] 🧹 Räume auf und verifiziere...", 'step')
                
                # Final verification of node_modules in the build - dynamisch suchen
                win_unpacked_base = dist_dir / 'win-unpacked'
                dotenv_found = False
                
                # Suche dotenv in allen möglichen Pfaden
                for dotenv_path in win_unpacked_base.rglob('dotenv'):
                    if dotenv_path.is_dir() and (dotenv_path / 'lib').exists():
                        self.log(f"   ✅ dotenv gefunden: {dotenv_path}", 'success')
                        dotenv_found = True
                        break
                
                if dotenv_found:
                    self.log("   ✅ node_modules im Build verifiziert (inkl. dotenv)", 'success')
                else:
                    # Prüfe ob überhaupt ein node_modules existiert
                    nm_found = False
                    for nm_path in win_unpacked_base.rglob('node_modules'):
                        if nm_path.is_dir():
                            self.log(f"   ⚠️ node_modules gefunden aber ohne dotenv: {nm_path}", 'warning')
                            nm_found = True
                            break
                    if not nm_found:
                        self.log("   ❌ Kein node_modules im Build gefunden!", 'error')
                
                self.log("=" * 60, 'success')
                self.log("✅ BUILD ERFOLGREICH!", 'success')
                self.log("=" * 60, 'success')
                
                # Erstellte Dateien anzeigen
                app_name = self.app_name_var.get().strip() or 'LTTH'
                if dist_dir.exists():
                    for f in dist_dir.glob('*.exe'):
                        self.log(f"   📁 {f.name}", 'success')
                
                self.log(f"\n   App-Name: {app_name}", 'success')
                if self.custom_icon_path:
                    self.log(f"   Icon: {self.custom_icon_path.name}", 'success')
                
                self.root.after(0, lambda: self.set_status("✅ Build erfolgreich!", self.colors['success']))
                self.root.after(0, lambda: messagebox.showinfo(
                    "Build erfolgreich!", 
                    f"Der Windows Installer für '{app_name}' wurde erfolgreich erstellt!\n\nDu findest ihn im dist-Ordner."
                ))
            else:
                self.log("", 'info')
                self.log("=" * 60, 'error')
                self.log("❌ BUILD FEHLGESCHLAGEN!", 'error')
                self.log("=" * 60, 'error')
                self.root.after(0, lambda: self.set_status("❌ Build fehlgeschlagen!", self.colors['error']))
                
        except Exception as e:
            self.log(f"❌ Fehler: {str(e)}", 'error')
            self.root.after(0, lambda: self.set_status("❌ Fehler!", self.colors['error']))
        finally:
            self.root.after(0, self.build_finished)
            
    def run_command(self, cmd, extra_env=None, cwd=None):
        """Führt einen Befehl aus und zeigt die Ausgabe an"""
        try:
            # Verwende das angegebene cwd oder project_dir als Fallback
            working_dir = cwd if cwd else self.project_dir
            self.log(f"   Führe aus: {' '.join(cmd)} (in {working_dir})", 'info')
            
            # Environment vorbereiten
            env = os.environ.copy()
            if extra_env:
                env.update(extra_env)
            
            # Windows-spezifische Flags
            kwargs = {
                'stdout': subprocess.PIPE,
                'stderr': subprocess.STDOUT,
                'text': True,
                'bufsize': 1,
                'cwd': str(working_dir),
                'env': env
            }
            
            if sys.platform == 'win32':
                kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
                # Auf Windows npm/npx als npm.cmd/npx.cmd aufrufen
                if cmd[0] == 'npm':
                    cmd = ['npm.cmd'] + cmd[1:]
                elif cmd[0] == 'npx':
                    cmd = ['npx.cmd'] + cmd[1:]
            
            self.process = subprocess.Popen(cmd, **kwargs)
            
            # Ausgabe lesen
            for line in iter(self.process.stdout.readline, ''):
                if not self.is_building:
                    break
                line = line.rstrip()
                if line:
                    # Fehler erkennen
                    if 'error' in line.lower() or '⨯' in line:
                        self.log(f"   {line}", 'error')
                    elif 'warning' in line.lower() or 'warn' in line.lower():
                        self.log(f"   {line}", 'warning')
                    else:
                        self.log(f"   {line}", 'info')
            
            self.process.wait()
            return self.process.returncode == 0
            
        except Exception as e:
            self.log(f"   Fehler: {str(e)}", 'error')
            return False
    
    def kill_process_tree(self, pid):
        """Beendet einen Prozess und alle seine Kind-Prozesse (Windows-spezifisch)"""
        if sys.platform == 'win32':
            try:
                # taskkill /T beendet den gesamten Prozessbaum
                subprocess.run(
                    ['taskkill', '/F', '/T', '/PID', str(pid)],
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            except Exception:
                pass
        else:
            # Auf Unix: Prozessgruppe beenden
            try:
                os.killpg(os.getpgid(pid), signal.SIGTERM)
            except Exception:
                try:
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    pass
            
    def stop_build(self):
        """Stoppt den Build-Prozess"""
        if self.process:
            try:
                # Kill entire process tree to release file handles
                self.kill_process_tree(self.process.pid)
                self.log("⏹️ Build abgebrochen!", 'warning')
            except:
                pass
        self.is_building = False
    
    def cleanup_processes(self):
        """Bereinigt alle laufenden Prozesse beim Beenden"""
        if hasattr(self, 'process') and self.process:
            try:
                self.kill_process_tree(self.process.pid)
            except:
                pass
    
    def on_close(self):
        """Handler für Fenster-Schließen"""
        if self.is_building:
            if messagebox.askyesno(
                "Build läuft",
                "Ein Build läuft noch. Möchtest du wirklich beenden?\n\n"
                "Alle laufenden Prozesse werden beendet."
            ):
                self.cleanup_processes()
                self.root.destroy()
        else:
            self.cleanup_processes()
            self.root.destroy()
        
    def build_finished(self):
        """Wird aufgerufen wenn der Build fertig ist"""
        self.is_building = False
        self.progress.stop()
        self.build_button.config(state=tk.NORMAL)
        self.stop_button.config(state=tk.DISABLED)
        self.process = None
        
    def open_dist_folder(self):
        """Öffnet den dist-Ordner im Explorer"""
        dist_dir = self.project_dir / 'dist'
        if dist_dir.exists():
            if sys.platform == 'win32':
                os.startfile(dist_dir)
            elif sys.platform == 'darwin':
                subprocess.run(['open', dist_dir])
            else:
                subprocess.run(['xdg-open', dist_dir])
        else:
            messagebox.showwarning(
                "Ordner nicht gefunden", 
                "Der dist-Ordner existiert noch nicht.\nFühre zuerst einen Build aus!"
            )

def main():
    root = tk.Tk()
    
    # Icon setzen (falls vorhanden)
    try:
        icon_path = Path(__file__).parent / 'icon.ico'
        if icon_path.exists():
            root.iconbitmap(icon_path)
    except:
        pass
    
    app = BuilderGUI(root)
    root.mainloop()

if __name__ == '__main__':
    main()
