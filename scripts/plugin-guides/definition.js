'use strict';

const LOCALES = ['de', 'en', 'es', 'fr'];

function localized(de, en, es, fr) {
  return { de, en, es, fr };
}

function localizedWorkflow(name, topic, test, overlay) {
  return {
    goldenPath: {
      title: localized(
        `${name} im Testprofil einrichten`,
        `Set up ${name} in the test profile`,
        `Configurar ${name} en el perfil de prueba`,
        `Configurer ${name} dans le profil de test`
      ),
      summary: localized(
        `Öffne ${topic.de}, setze ausschließlich die sichtbaren Testwerte, speichere sie und prüfe das lokale Ergebnis.`,
        `Open ${topic.en}, set only the visible test values, save them, and verify the local result.`,
        `Abre ${topic.es}, establece solo los valores de prueba visibles, guárdalos y comprueba el resultado local.`,
        `Ouvrez ${topic.fr}, définissez uniquement les valeurs de test visibles, enregistrez-les et vérifiez le résultat local.`
      )
    },
    localTest: {
      title: localized(
        `${test.de} prüfen`,
        `Verify ${test.en}`,
        `Comprobar ${test.es}`,
        `Vérifier ${test.fr}`
      ),
      summary: localized(
        'Der Test bleibt lokal; er verbindet weder ein Konto noch eine LIVE-Ausgabe.',
        'The test remains local; it connects neither an account nor LIVE output.',
        'La prueba permanece local; no conecta ninguna cuenta ni salida LIVE.',
        'Le test reste local ; il ne connecte ni compte ni sortie LIVE.'
      )
    },
    overlay: overlay ? {
      title: localized('Overlay sicher prüfen', 'Verify the overlay safely', 'Comprobar el overlay de forma segura', 'Vérifier l’overlay en sécurité'),
      summary: localized(
        'Verwende die URL nur in einer nicht sendenden OBS-Testszene und entferne die temporäre Quelle anschließend.',
        'Use the URL only in an OBS test scene that is not live, then remove the temporary source.',
        'Usa la URL solo en una escena de prueba de OBS que no esté al aire y elimina después la fuente temporal.',
        'Utilisez l’URL uniquement dans une scène de test OBS non diffusée, puis retirez la source temporaire.'
      )
    } : null
  };
}

function settingFromStep(step) {
  const action = step.capture.action;
  const isAction = ['save-demo-config', 'run-local-preview', 'reset-demo-state'].includes(action.type);
  return {
    selector: step.capture.assertVisible,
    kind: isAction ? 'action' : 'control',
    purpose: Object.fromEntries(LOCALES.map((locale) => [locale, step.copy[locale].body])),
    defaultValue: localized(
      'Ausgangswert des frisch erzeugten Testprofils.',
      'Initial value in the newly created test profile.',
      'Valor inicial del perfil de prueba recién creado.',
      'Valeur initiale du profil de test nouvellement créé.'
    ),
    values: localized(
      'Nur den sichtbaren Wert oder die sichtbare Aktion verwenden; keine Produktionsdaten eintragen.',
      'Use only the visible value or action; do not enter production data.',
      'Usa solo el valor o la acción visibles; no introduzcas datos de producción.',
      'Utilisez uniquement la valeur ou l’action visible ; ne saisissez pas de données de production.'
    ),
    dependencies: localized(
      `Schritt „${step.copy.de.title}“ muss in der lokalen Oberfläche sichtbar sein.`,
      `The “${step.copy.en.title}” step must be visible in the local surface.`,
      `El paso «${step.copy.es.title}» debe estar visible en la superficie local.`,
      `L’étape « ${step.copy.fr.title} » doit être visible dans la surface locale.`
    ),
    stepId: step.id
  };
}

function settingFromInventory(control) {
  return {
    selector: control.selector,
    kind: control.kind,
    purpose: localized(
      `Das sichtbare Feld oder die Aktion „${control.label}“ wird im Testprofil dokumentiert.`,
      `The visible “${control.label}” field or action is documented in the test profile.`,
      `El campo o la accion visible «${control.label}» se documenta en el perfil de prueba.`,
      `Le champ ou l action visible « ${control.label} » est documente dans le profil de test.`
    ),
    defaultValue: Object.fromEntries(LOCALES.map((locale) => [locale, control.defaultValue])),
    values: Object.fromEntries(LOCALES.map((locale) => [locale, control.values])),
    dependencies: localized(
      `Sichtbar auf ${control.route}.`,
      `Visible on ${control.route}.`,
      `Visible en ${control.route}.`,
      `Visible sur ${control.route}.`
    )
  };
}

function integrationDescription(type, value) {
  const labels = {
    rest: localized('Öffentlicher lokaler REST-Endpunkt aus dem Plugin-Code; der Guide sendet keine Anfrage.', 'Public local REST endpoint from the plugin code; the guide sends no request.', 'Endpoint REST local público del código del plugin; la guía no envía solicitudes.', 'Endpoint REST local public issu du code du plugin ; le guide n’envoie aucune requête.'),
    'socket-event': localized('Socket-Ereignis, das im Plugin-Code registriert ist.', 'Socket event registered in the plugin code.', 'Evento de socket registrado en el código del plugin.', 'Événement socket enregistré dans le code du plugin.'),
    'flow-action': localized('Flow-Aktion, die das Plugin für lokale Automatisierungen registriert.', 'Flow action registered by the plugin for local automations.', 'Acción de flujo registrada por el plugin para automatizaciones locales.', 'Action de flux enregistrée par le plugin pour les automatisations locales.'),
    'chat-command': localized('Chat-Befehl, der vom Plugin-Code registriert wird.', 'Chat command registered by the plugin code.', 'Comando de chat registrado por el código del plugin.', 'Commande de chat enregistrée par le code du plugin.'),
    storage: localized('Persistenzzugriff, der im Plugin-Code verwendet wird.', 'Persistence access used by the plugin code.', 'Acceso de persistencia usado por el código del plugin.', 'Accès de persistance utilisé par le code du plugin.'),
    'import-export': localized('Import-/Export-Endpunkt aus dem Plugin-Code; im Guide nur als Referenz, nicht ausgeführt.', 'Import/export endpoint from the plugin code; reference only, never executed by the guide.', 'Endpoint de importación/exportación del código del plugin; solo referencia, la guía no lo ejecuta.', 'Endpoint d’import/export issu du code du plugin ; uniquement une référence, jamais exécutée par le guide.')
  };
  return labels[type] || localized(
    `Verifizierter Integrationswert aus dem Plugin-Code: ${value}.`,
    `Verified integration value from the plugin code: ${value}.`,
    `Valor de integración verificado del código del plugin: ${value}.`,
    `Valeur d’intégration vérifiée dans le code du plugin : ${value}.`
  );
}

function createGuideDefinition({ name, version, entry, copy, steps, overlay, inventory = { controls: [] }, integrationInventory = { integrations: [] } }) {
  const workflows = localizedWorkflow(name, entry.topic, entry.test, overlay);
  const localTestSteps = steps.filter((step) => ['run-local-preview', 'save-demo-config'].includes(step.capture.action.type)).map((step) => step.id);
  const overlaySteps = steps.filter((step) => step.capture.action.type === 'open-overlay-preview').map((step) => step.id);
  const stepBySelector = new Map(steps.map((step) => [step.capture.assertVisible, step]));
  const inventoryControls = inventory.controls || [];
  const settingsReference = inventoryControls.filter((control) => control.kind !== 'link').map((control) => {
    const step = stepBySelector.get(control.selector);
    if (!step) return settingFromInventory(control);
    return {
      ...settingFromStep(step),
      defaultValue: Object.fromEntries(LOCALES.map((locale) => [locale, control.defaultValue])),
      values: Object.fromEntries(LOCALES.map((locale) => [locale, control.values]))
    };
  });
  for (const step of steps) {
    if (!settingsReference.some((setting) => setting.selector === step.capture.assertVisible)) settingsReference.push(settingFromStep(step));
  }
  const visibleControls = inventoryControls.map((control) => {
    const step = stepBySelector.get(control.selector);
    return {
      selector: control.selector,
      classification: 'documented',
      section: step ? `step-${step.id}` : 'guide-settings',
      stepId: step?.id || null
    };
  });
  for (const step of steps) {
    if (!visibleControls.some((control) => control.selector === step.capture.assertVisible)) {
      visibleControls.push({ selector: step.capture.assertVisible, classification: 'documented', section: `step-${step.id}`, stepId: step.id });
    }
  }

  return {
    metadata: {
      purpose: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].summary])),
      audience: localized(
        `Streamer:innen, die ${entry.topic.de} zuerst ohne LIVE-Auswirkung einrichten möchten.`,
        `Streamers who want to set up ${entry.topic.en} without LIVE impact first.`,
        `Streamers que quieren configurar primero ${entry.topic.es} sin impacto LIVE.`,
        `Streamers qui souhaitent d’abord configurer ${entry.topic.fr} sans impact LIVE.`
      ),
      version,
      prerequisites: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].requirements])),
      safetyBoundaries: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].safety]))
    },
    activation: {
      route: entry.route,
      navigation: localized(
        `Öffne im Plugin Manager „${name}“, aktiviere es bei Bedarf und rufe dann die lokale Konfiguration auf.`,
        `Open “${name}” in Plugin Manager, enable it when needed, then open its local configuration.`,
        `Abre «${name}» en el gestor de plugins, actívalo si es necesario y abre después su configuración local.`,
        `Ouvrez « ${name} » dans le gestionnaire de plugins, activez-le si nécessaire, puis ouvrez sa configuration locale.`
      )
    },
    workflows: [
      { id: 'golden-path', kind: 'golden-path', title: workflows.goldenPath.title, summary: workflows.goldenPath.summary, stepIds: steps.map((step) => step.id) },
      ...(localTestSteps.length ? [{ id: 'local-test', kind: 'local-test', title: workflows.localTest.title, summary: workflows.localTest.summary, stepIds: localTestSteps }] : []),
      ...(overlaySteps.length ? [{ id: 'overlay-preview', kind: 'obs', title: workflows.overlay.title, summary: workflows.overlay.summary, stepIds: overlaySteps }] : [])
    ],
    settingsReference,
    integrations: [
      {
        type: 'local-surface',
        value: entry.route,
        description: localized(
          'Lokale Konfigurationsoberfläche im isolierten Testprofil.',
          'Local configuration surface in the isolated test profile.',
          'Superficie de configuración local en el perfil de prueba aislado.',
          'Surface de configuration locale dans le profil de test isolé.'
        )
      },
      ...(overlay ? [{
        type: 'overlay-url',
        value: overlay,
        description: localized(
          'Lokale Overlay-URL für eine temporäre Browserquelle.',
          'Local overlay URL for a temporary browser source.',
          'URL de overlay local para una fuente de navegador temporal.',
          'URL d’overlay locale pour une source navigateur temporaire.'
        )
      }] : []),
      ...(integrationInventory.integrations || []).map((integration) => ({
        type: integration.type,
        value: integration.value,
        description: integrationDescription(integration.type, integration.value)
      }))
    ],
    troubleshooting: [
      {
        symptom: localized(
          `${name}: ${entry.topic.de} ist in der lokalen Oberfläche oder Vorschau leer.`,
          `${name}: ${entry.topic.en} is empty in the local surface or preview.`,
          `${name}: ${entry.topic.es} está vacío en la superficie local o vista previa.`,
          `${name} : ${entry.topic.fr} est vide dans la surface locale ou l’aperçu.`
        ),
        checks: Object.fromEntries(LOCALES.map((locale) => [locale, [copy[locale].troubleshooting, copy[locale].requirements]])),
        resolution: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].troubleshooting]))
      }
    ],
    visibleControls
  };
}

module.exports = { createGuideDefinition };
