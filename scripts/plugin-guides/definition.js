'use strict';

const LOCALES = ['de', 'en', 'es', 'fr'];

function localized(de, en, es, fr) {
  return { de, en, es, fr };
}

function sourceAnchor(route, controls = [], integrations = []) {
  const integrationOrder = ['rest', 'socket-event', 'flow-action', 'chat-command', 'import-export', 'storage'];
  const integration = [...integrations].sort((left, right) => (
    integrationOrder.indexOf(left.type) - integrationOrder.indexOf(right.type)
    || left.value.localeCompare(right.value)
  ))[0] || null;
  return {
    route,
    control: controls[0] || null,
    integration
  };
}

function sourceControlReference(control, fallbackRoute, locale) {
  if (!control) return '';
  const route = control.route || fallbackRoute;
  const label = control.label || control.selector;
  const references = {
    de: `Quellinventar auf ${route}: "${label}" (${control.selector}).`,
    en: `Source inventory on ${route}: "${label}" (${control.selector}).`,
    es: `Inventario fuente en ${route}: "${label}" (${control.selector}).`,
    fr: `Inventaire source sur ${route} : "${label}" (${control.selector}).`
  };
  return references[locale];
}

function sourceIntegrationReference(integration, locale) {
  if (!integration) return '';
  const identifier = `${integration.method ? `${integration.method} ` : ''}${integration.value}`;
  const references = {
    de: `Im Plugin-Code deklarierte Schnittstelle: ${identifier}.`,
    en: `Interface declared in the plugin code: ${identifier}.`,
    es: `Interfaz declarada en el codigo del plugin: ${identifier}.`,
    fr: `Interface declaree dans le code du plugin : ${identifier}.`
  };
  return references[locale];
}

function sourceReference(anchor, locale) {
  const references = [
    sourceControlReference(anchor.control, anchor.route, locale),
    sourceIntegrationReference(anchor.integration, locale)
  ].filter(Boolean);
  const labels = {
    de: `Lokale Guide-Route: ${anchor.route}.`,
    en: `Local guide route: ${anchor.route}.`,
    es: `Ruta local de la guia: ${anchor.route}.`,
    fr: `Route locale du guide : ${anchor.route}.`
  };
  if (anchor.control) return references.join(' ');
  if (references.length) return `${labels[locale]} ${references.join(' ')}`;
  return labels[locale];
}

function localizedWorkflow(name, topic, test, overlay, anchor) {
  return {
    goldenPath: {
      title: localized(
        `${name} im Testprofil einrichten`,
        `Set up ${name} in the test profile`,
        `Configurar ${name} en el perfil de prueba`,
        `Configurer ${name} dans le profil de test`
      ),
      summary: localized(
        `Workflow-Referenz für ${topic.de}: ${sourceReference(anchor, 'de')}`,
        `Workflow reference for ${topic.en}: ${sourceReference(anchor, 'en')}`,
        `Referencia de flujo para ${topic.es}: ${sourceReference(anchor, 'es')}`,
        `Référence du flux pour ${topic.fr} : ${sourceReference(anchor, 'fr')}`
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
        `Prüfreferenz für diesen Ablauf: ${sourceReference(anchor, 'de')}`,
        `Verification reference for this workflow: ${sourceReference(anchor, 'en')}`,
        `Referencia de verificación para este flujo: ${sourceReference(anchor, 'es')}`,
        `Référence de vérification pour ce flux : ${sourceReference(anchor, 'fr')}`
      )
    },
    overlay: overlay ? {
      title: localized('Overlay sicher prüfen', 'Verify the overlay safely', 'Comprobar el overlay de forma segura', 'Vérifier l’overlay en sécurité'),
      summary: localized(
        `Overlay-Referenz ${overlay}. ${sourceReference(anchor, 'de')}`,
        `Overlay reference ${overlay}. ${sourceReference(anchor, 'en')}`,
        `Referencia de overlay ${overlay}. ${sourceReference(anchor, 'es')}`,
        `Référence d'overlay ${overlay}. ${sourceReference(anchor, 'fr')}`
      )
  } : null
  };
}

function valueForAllLocales(value) {
  return Object.fromEntries(LOCALES.map((locale) => [locale, value]));
}

function hasStaticControlValue(value) {
  return typeof value === 'string' && !/^(?:text or value shown in the control|not declared)$/i.test(value);
}

function undeclaredControlValue(selector, route, kind) {
  return localized(
    `Kein statischer ${kind === 'defaultValue' ? 'Standardwert' : 'Optionswert'} für ${selector} auf ${route} im Quellmarkup deklariert.`,
    `No static ${kind === 'defaultValue' ? 'default value' : 'option value'} is declared for ${selector} on ${route} in source markup.`,
    `No se declara ningún ${kind === 'defaultValue' ? 'valor predeterminado' : 'valor de opción'} estático para ${selector} en ${route} en el marcado fuente.`,
    `Aucune ${kind === 'defaultValue' ? 'valeur par défaut' : 'valeur d’option'} statique n'est déclarée pour ${selector} sur ${route} dans le balisage source.`
  );
}

function workflowSettingFromStep(step, control = null, route) {
  const sourceControl = control || {
    selector: step.capture.assertVisible,
    label: step.capture.assertVisible,
    route
  };
  return {
    selector: step.capture.assertVisible,
    kind: control?.kind || 'control',
    purpose: Object.fromEntries(LOCALES.map((locale) => [locale, sourceControlReference(sourceControl, route, locale)])),
    defaultValue: hasStaticControlValue(control?.defaultValue)
      ? valueForAllLocales(control.defaultValue)
      : undeclaredControlValue(sourceControl.selector, route, 'defaultValue'),
    values: hasStaticControlValue(control?.values)
      ? valueForAllLocales(control.values)
      : undeclaredControlValue(sourceControl.selector, route, 'values'),
    dependencies: Object.fromEntries(LOCALES.map((locale) => [locale, sourceControlReference(sourceControl, route, locale)])),
    stepId: step.id
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

function tutorialIntegrations(entries = []) {
  const allowed = entries.filter((integration) => ['rest', 'flow-action', 'chat-command'].includes(integration.type));
  const prioritized = [
    ...allowed.filter((integration) => integration.type === 'rest' && /(?:config|settings|status)$/i.test(integration.value)),
    ...allowed.filter((integration) => integration.type === 'flow-action' && /(?:trigger|test|run)/i.test(integration.value)),
    ...allowed.filter((integration) => integration.type === 'chat-command'),
    ...allowed
  ];
  const seen = new Set();
  return prioritized.filter((integration) => {
    const key = `${integration.type}:${integration.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function completeSettingReferences(steps, inventoryControls, controlBySelector, route) {
  const settings = new Map();
  for (const step of steps) {
    settings.set(step.capture.assertVisible, workflowSettingFromStep(step, controlBySelector.get(step.capture.assertVisible), route));
  }
  for (const control of inventoryControls) {
    if (settings.has(control.selector)) continue;
    const sourceDefault = hasStaticControlValue(control.defaultValue)
      ? valueForAllLocales(control.defaultValue)
      : undeclaredControlValue(control.selector, route, 'defaultValue');
    const sourceValues = hasStaticControlValue(control.values)
      ? valueForAllLocales(control.values)
      : undeclaredControlValue(control.selector, route, 'values');
    settings.set(control.selector, {
      selector: control.selector,
      kind: control.kind,
      purpose: Object.fromEntries(LOCALES.map((locale) => [locale, sourceControlReference(control, route, locale)])),
      defaultValue: sourceDefault,
      values: sourceValues,
      dependencies: Object.fromEntries(LOCALES.map((locale) => [locale, sourceControlReference(control, route, locale)]))
    });
  }
  return [...settings.values()];
}

function completeVisibleControls(steps, inventoryControls) {
  const controls = new Map();
  for (const step of steps) {
    controls.set(step.capture.assertVisible, {
      selector: step.capture.assertVisible,
      classification: 'documented',
      section: `step-${step.id}`,
      stepId: step.id
    });
  }
  for (const control of inventoryControls) {
    if (controls.has(control.selector)) continue;
    controls.set(control.selector, {
      selector: control.selector,
      classification: 'documented',
      section: 'guide-settings',
      stepId: 'guide-settings'
    });
  }
  return [...controls.values()];
}

function completeIntegrations(entries = []) {
  const seen = new Set();
  return entries.filter((integration) => {
    const key = `${integration.type}:${integration.method || ''}:${integration.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localizedTroubleshooting(anchor) {
  const text = (locale) => sourceReference(anchor, locale);
  return {
    symptom: localized(
      'Quellreferenz der lokalen Konfiguration prüfen.',
      'Review the local configuration source reference.',
      'Revisa la referencia fuente de la configuración local.',
      'Vérifiez la référence source de la configuration locale.'
    ),
    checks: Object.fromEntries(LOCALES.map((locale) => [locale, [sourceReference(anchor, locale)] ])),
    resolution: Object.fromEntries(LOCALES.map((locale) => [locale, text(locale)]))
  };
}

function createGuideDefinition({ name, version, entry, copy, steps, overlay, inventory = { controls: [] }, integrationInventory = { integrations: [] } }) {
  const localTestSteps = steps.filter((step) => ['run-local-preview', 'save-demo-config'].includes(step.capture.action.type)).map((step) => step.id);
  const overlaySteps = steps.filter((step) => step.capture.action.type === 'open-overlay-preview').map((step) => step.id);
  const inventoryControls = inventory.controls || [];
  const controlBySelector = new Map(inventoryControls.map((control) => [control.selector, control]));
  const integrations = completeIntegrations(integrationInventory.integrations);
  const anchor = sourceAnchor(entry.route, inventoryControls, integrations);
  const workflows = localizedWorkflow(name, entry.topic, entry.test, overlay, anchor);
  // The reference is derived from the shipped surface instead of silently
  // dropping controls or interfaces that the shorter golden path omits.
  const settingsReference = completeSettingReferences(steps, inventoryControls, controlBySelector, entry.route);
  const visibleControls = completeVisibleControls(steps, inventoryControls);

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
      ...integrations.map((integration) => ({
        type: integration.type,
        value: integration.value,
        ...(integration.method ? { method: integration.method } : {}),
        description: integrationDescription(integration.type, integration.value)
      }))
    ],
    troubleshooting: [localizedTroubleshooting(anchor)],
    visibleControls
  };
}

module.exports = { createGuideDefinition };
