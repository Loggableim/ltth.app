'use strict';

const LOCALES = ['de', 'en', 'es', 'fr'];

function localized(de, en, es, fr) {
  return { de, en, es, fr };
}

function controlLabel(control, locale) {
  return control?.labels?.[locale] || control?.label || control?.selector || '';
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

function sourceControlReference(control, fallbackRoute, locale, context = 'purpose') {
  if (!control) return '';
  const route = control.route || fallbackRoute;
  const label = controlLabel(control, locale);
  const identity = `„${label}“ (${control.selector})`;
  const englishIdentity = `“${label}” (${control.selector})`;
  const values = String(control.values || '');
  const toggle = values === 'checked, unchecked';
  const range = /^-?\d+(?:\.\d+)?\s+to\s+-?\d+(?:\.\d+)?$/i.test(values);
  const fixedChoices = values && values !== 'text or value shown in the control' && values !== 'not declared';
  const purpose = {
    de: control.kind === 'action'
      ? `${identity} führt auf ${route} die zugehörige Produktaktion aus.`
      : control.kind === 'link'
        ? `${identity} öffnet auf ${route} den verknüpften Produktbereich.`
        : toggle
          ? `${identity} schaltet das zugehörige Verhalten auf ${route} ein oder aus.`
          : range
            ? `${identity} begrenzt den Eingabewert auf den deklarierten Bereich ${values}.`
            : fixedChoices
              ? `${identity} bietet auf ${route} diese statisch definierten Werte: ${values}.`
              : `${identity} nimmt auf ${route} den für diese Plugin-Konfiguration benötigten Freitext oder Wert entgegen.`,
    en: control.kind === 'action'
      ? `${englishIdentity} runs the related product action on ${route}.`
      : control.kind === 'link'
        ? `${englishIdentity} opens the linked product area on ${route}.`
        : toggle
          ? `${englishIdentity} turns its related behaviour on or off on ${route}.`
          : range
            ? `${englishIdentity} limits input to the declared range ${values}.`
            : fixedChoices
              ? `${englishIdentity} offers these statically declared values on ${route}: ${values}.`
              : `${englishIdentity} accepts the free-form value required by this plugin configuration on ${route}.`,
    es: control.kind === 'action'
      ? `«${label}» (${control.selector}) ejecuta la acción correspondiente del producto en ${route}.`
      : control.kind === 'link'
        ? `«${label}» (${control.selector}) abre el área vinculada del producto en ${route}.`
        : toggle
          ? `«${label}» (${control.selector}) activa o desactiva el comportamiento asociado en ${route}.`
          : range
            ? `«${label}» (${control.selector}) limita la entrada al intervalo declarado ${values}.`
            : fixedChoices
              ? `«${label}» (${control.selector}) ofrece en ${route} estos valores declarados estáticamente: ${values}.`
              : `«${label}» (${control.selector}) acepta el valor libre necesario para esta configuración del plugin en ${route}.`,
    fr: control.kind === 'action'
      ? `« ${label} » (${control.selector}) exécute l’action produit associée sur ${route}.`
      : control.kind === 'link'
        ? `« ${label} » (${control.selector}) ouvre la zone produit liée sur ${route}.`
        : toggle
          ? `« ${label} » (${control.selector}) active ou désactive le comportement associé sur ${route}.`
          : range
            ? `« ${label} » (${control.selector}) limite la saisie à la plage déclarée ${values}.`
            : fixedChoices
              ? `« ${label} » (${control.selector}) propose sur ${route} ces valeurs déclarées statiquement : ${values}.`
              : `« ${label} » (${control.selector}) accepte la valeur libre requise par cette configuration de plugin sur ${route}.`
  };
  const references = {
    de: context === 'dependencies'
      ? `${identity} steht auf ${route} in dieser Konfigurationsansicht bereit; weitere statische Abhängigkeiten sind nicht deklariert.`
      : control.kind === 'action'
        ? `Mit ${identity} auf ${route} führst du die zugehörige Aktion aus.`
        : control.kind === 'link'
          ? `Über ${identity} auf ${route} öffnest du den verknüpften Bereich.`
          : purpose.de,
    en: context === 'dependencies'
      ? `${englishIdentity} is available on ${route} in this configuration view; no additional static dependency is declared.`
      : control.kind === 'action'
        ? `Use ${englishIdentity} on ${route} to run its action.`
        : control.kind === 'link'
          ? `Use ${englishIdentity} on ${route} to open the linked area.`
          : purpose.en,
    es: context === 'dependencies'
      ? `«${label}» (${control.selector}) está disponible en ${route} dentro de esta vista de configuración; no se declara otra dependencia estática.`
      : control.kind === 'action'
        ? `Usa «${label}» (${control.selector}) en ${route} para ejecutar la acción correspondiente.`
        : control.kind === 'link'
          ? `Usa «${label}» (${control.selector}) en ${route} para abrir el área vinculada.`
          : purpose.es,
    fr: context === 'dependencies'
      ? `« ${label} » (${control.selector}) est disponible sur ${route} dans cette vue de configuration ; aucune autre dépendance statique n’est déclarée.`
      : control.kind === 'action'
        ? `Utilisez « ${label} » (${control.selector}) sur ${route} pour exécuter l’action correspondante.`
        : control.kind === 'link'
          ? `Utilisez « ${label} » (${control.selector}) sur ${route} pour ouvrir la zone associée.`
          : purpose.fr
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
        `Der Golden Path für ${topic.de} beginnt auf ${anchor.route}; ${sourceReference(anchor, 'de')}`,
        `The golden path for ${topic.en} starts on ${anchor.route}; ${sourceReference(anchor, 'en')}`,
        `La ruta principal para ${topic.es} comienza en ${anchor.route}; ${sourceReference(anchor, 'es')}`,
        `Le parcours principal pour ${topic.fr} commence sur ${anchor.route} ; ${sourceReference(anchor, 'fr')}`
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
        `Der lokale Test für ${topic.de} läuft auf ${anchor.route}; ${sourceReference(anchor, 'de')}`,
        `The local test for ${topic.en} runs on ${anchor.route}; ${sourceReference(anchor, 'en')}`,
        `La prueba local de ${topic.es} se realiza en ${anchor.route}; ${sourceReference(anchor, 'es')}`,
        `Le test local de ${topic.fr} s’exécute sur ${anchor.route} ; ${sourceReference(anchor, 'fr')}`
      )
    },
    overlay: overlay ? {
      title: localized('Overlay sicher prüfen', 'Verify the overlay safely', 'Comprobar el overlay de forma segura', 'Vérifier l’overlay en sécurité'),
      summary: localized(
        `Für ${topic.de} führt die reale Overlay-URL ${overlay} zur lokalen Vorschau; die Konfiguration liegt auf ${anchor.route}. ${sourceReference(anchor, 'de')}`,
        `For ${topic.en}, the real overlay URL ${overlay} opens the local preview; configuration is on ${anchor.route}. ${sourceReference(anchor, 'en')}`,
        `Para ${topic.es}, la URL real del overlay ${overlay} abre la vista previa local; la configuración está en ${anchor.route}. ${sourceReference(anchor, 'es')}`,
        `Pour ${topic.fr}, l’URL réelle de l’overlay ${overlay} ouvre l’aperçu local ; la configuration se trouve sur ${anchor.route}. ${sourceReference(anchor, 'fr')}`
      )
  } : null
  };
}

function hasStaticControlValue(value) {
  return typeof value === 'string' && !/^(?:text or value shown in the control|not declared)$/i.test(value);
}

function undeclaredControlValue(control, route, kind) {
  const selector = control.selector;
  const isDefault = kind === 'defaultValue';
  return localized(
    isDefault
      ? `„${controlLabel(control, 'de')}“ (${selector}) auf ${route} startet ohne vorgegebenen Wert; lege ihn beim Einrichten fest.`
      : `Für „${controlLabel(control, 'de')}“ (${selector}) auf ${route} gibt es keine feste Auswahlliste; verwende einen zur Einrichtung passenden Wert.`,
    isDefault
      ? `“${controlLabel(control, 'en')}” (${selector}) on ${route} starts without a preset value; choose it during setup.`
      : `“${controlLabel(control, 'en')}” (${selector}) on ${route} has no fixed option list; use the value that fits your setup.`,
    isDefault
      ? `«${controlLabel(control, 'es')}» (${selector}) en ${route} se inicia sin un valor predefinido; establécelo durante la configuración.`
      : `«${controlLabel(control, 'es')}» (${selector}) en ${route} no tiene una lista fija de opciones; usa el valor que encaje con tu configuración.`,
    isDefault
      ? `« ${controlLabel(control, 'fr')} » (${selector}) sur ${route} démarre sans valeur prédéfinie ; définissez-la pendant la configuration.`
      : `« ${controlLabel(control, 'fr')} » (${selector}) sur ${route} ne propose pas de liste d’options fixe ; utilisez la valeur adaptée à votre configuration.`
  );
}

function localizedControlValue(control, route, kind) {
  const value = control[kind];
  if (!hasStaticControlValue(value)) return undeclaredControlValue(control, route, kind);
  const isDefault = kind === 'defaultValue';
  const text = String(value);
  return localized(
    isDefault
      ? `Vorgegebener Wert für „${controlLabel(control, 'de')}“ (${control.selector}) auf ${route}: „${text}“.`
      : `Für „${controlLabel(control, 'de')}“ (${control.selector}) auf ${route} sind diese Werte vorgesehen: ${text}.`,
    isDefault
      ? `Preset value for “${controlLabel(control, 'en')}” (${control.selector}) on ${route}: “${text}”.`
      : `Available values for “${controlLabel(control, 'en')}” (${control.selector}) on ${route}: ${text}.`,
    isDefault
      ? `Valor predefinido de «${controlLabel(control, 'es')}» (${control.selector}) en ${route}: «${text}».`
      : `Valores disponibles para «${controlLabel(control, 'es')}» (${control.selector}) en ${route}: ${text}.`,
    isDefault
      ? `Valeur prédéfinie de « ${controlLabel(control, 'fr')} » (${control.selector}) sur ${route} : « ${text} ».`
      : `Valeurs disponibles pour « ${controlLabel(control, 'fr')} » (${control.selector}) sur ${route} : ${text}.`
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
    defaultValue: localizedControlValue(sourceControl, route, 'defaultValue'),
    values: localizedControlValue(sourceControl, route, 'values'),
    dependencies: Object.fromEntries(LOCALES.map((locale) => [locale, sourceControlReference(sourceControl, route, locale, 'dependencies')])),
    stepId: step.id
  };
}

function integrationDescription(type, value, method = null) {
  const identifier = method ? `${method} ${value}` : value;
  const labels = {
    rest: localized(`Lokale REST-Referenz ${identifier}. Der Guide zeigt sie nur an und sendet keine Anfrage.`, `Local REST reference ${identifier}. The guide lists it only and sends no request.`, `Referencia REST local ${identifier}. La guía solo la muestra y no envía ninguna solicitud.`, `Référence REST locale ${identifier}. Le guide l’affiche uniquement et n’envoie aucune requête.`),
    'socket-event': localized(`Socket-Ereignis ${identifier}. Es beschreibt ein vom Plugin registriertes Signal.`, `Socket event ${identifier}. It identifies a signal registered by the plugin.`, `Evento de socket ${identifier}. Identifica una señal registrada por el plugin.`, `Événement socket ${identifier}. Il identifie un signal enregistré par le plugin.`),
    'flow-action': localized(`Flow-Aktion ${identifier}. Sie steht für lokale Automatisierungen bereit.`, `Flow action ${identifier}. It is available for local automations.`, `Acción de flujo ${identifier}. Está disponible para automatizaciones locales.`, `Action de flux ${identifier}. Elle est disponible pour les automatisations locales.`),
    'chat-command': localized(`Chat-Befehl ${identifier}. Das Plugin verarbeitet ihn als registrierten Befehl.`, `Chat command ${identifier}. The plugin handles it as a registered command.`, `Comando de chat ${identifier}. El plugin lo procesa como un comando registrado.`, `Commande de chat ${identifier}. Le plugin la traite comme une commande enregistrée.`),
    storage: localized(`Persistenzzugriff ${identifier}. Er wird für lokale Plugin-Daten verwendet.`, `Persistence access ${identifier}. It is used for local plugin data.`, `Acceso de persistencia ${identifier}. Se usa para datos locales del plugin.`, `Accès de persistance ${identifier}. Il est utilisé pour les données locales du plugin.`),
    'import-export': localized(`Import-/Export-Referenz ${identifier}. Der Guide dokumentiert sie, führt sie aber nicht aus.`, `Import/export reference ${identifier}. The guide documents it but does not execute it.`, `Referencia de importación/exportación ${identifier}. La guía la documenta, pero no la ejecuta.`, `Référence d’import/export ${identifier}. Le guide la documente sans l’exécuter.`)
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

function completeSettingReferences(steps, inventoryControls, controlBySelector, route, guideId) {
  const settings = new Map();
  for (const step of steps) {
    settings.set(step.capture.assertVisible, workflowSettingFromStep(step, controlBySelector.get(step.capture.assertVisible), route));
  }
  for (const control of inventoryControls) {
    if (settings.has(control.selector)) continue;
    if (inventoryControlException(guideId, control)) continue;
    const sourceDefault = localizedControlValue(control, route, 'defaultValue');
    const sourceValues = localizedControlValue(control, route, 'values');
    settings.set(control.selector, {
      selector: control.selector,
      kind: control.kind,
      purpose: Object.fromEntries(LOCALES.map((locale) => [locale, sourceControlReference(control, route, locale)])),
      defaultValue: sourceDefault,
      values: sourceValues,
      dependencies: Object.fromEntries(LOCALES.map((locale) => [locale, sourceControlReference(control, route, locale, 'dependencies')]))
    });
  }
  return [...settings.values()];
}

function completeVisibleControls(steps, inventoryControls, guideId) {
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
    const exception = inventoryControlException(guideId, control);
    controls.set(control.selector, {
      selector: control.selector,
      ...(exception || {
        classification: 'documented',
        section: 'guide-settings',
        stepId: 'guide-settings'
      })
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

const INTERNAL_INVENTORY_CONTROLS = new Set([
  'config-import:#impUserConfigs',
  'store-admin:#window-close-btn',
  'store-admin:#window-maximize-btn',
  'store-admin:#window-minimize-btn',
  'milestone-leaderboard:#audioInput',
  'milestone-leaderboard:#gifInput',
  'milestone-leaderboard:#tierAudioInput',
  'milestone-leaderboard:#tierVideoInput',
  'milestone-leaderboard:#videoInput'
]);

const DECORATIVE_INVENTORY_CONTROLS = new Set([
  'gift-catalog:#preset-de',
  'gift-catalog:#preset-jp',
  'gift-catalog:#preset-us',
  'fireworks:#add-color',
  'gcce:#media-url-input',
  'gcce:#rotator-accent-color',
  'gcce:#rotator-bg-color',
  'game-engine:#test-bet-slider',
  'stt-ticker:#overlay-url',
  'tts:#modalVolumeGainInput'
]);

function inventoryControlException(guideId, control) {
  const key = `${guideId}:${control.selector}`;
  if (INTERNAL_INVENTORY_CONTROLS.has(key)) {
    return {
      classification: 'internal',
      section: 'guide-controls',
      reason: localized(
        'Technisches oder im Browser verborgenes Eingabeelement; die sichtbare Bedienung ist separat beschriftet.',
        'Technical or browser-hidden input; its visible operation is labeled separately.',
        'Elemento de entrada técnico u oculto en el navegador; su operación visible se etiqueta por separado.',
        'Élément de saisie technique ou masqué dans le navigateur ; son opération visible est libellée séparément.'
      )
    };
  }
  if (DECORATIVE_INVENTORY_CONTROLS.has(key)) {
    return {
      classification: 'decorative',
      section: 'guide-controls',
      reason: localized(
        'Technischer Wert, Regionscode oder Symbol; keine eigenständige einstellbare Funktion.',
        'Technical value, region code, or symbol; not an independently configurable function.',
        'Valor técnico, código regional o símbolo; no es una función configurable independiente.',
        'Valeur technique, code régional ou symbole ; ce n’est pas une fonction configurable indépendante.'
      )
    };
  }
  return null;
}

function localizedTroubleshooting(copy, anchor) {
  const resolution = {
    de: `Öffne ${anchor.route}, prüfe den im Symptom genannten Zustand und wiederhole anschließend den lokalen Test. ${sourceReference(anchor, 'de')}`,
    en: `Open ${anchor.route}, verify the state named in the symptom, then repeat the local test. ${sourceReference(anchor, 'en')}`,
    es: `Abre ${anchor.route}, verifica el estado indicado en el síntoma y repite la prueba local. ${sourceReference(anchor, 'es')}`,
    fr: `Ouvrez ${anchor.route}, vérifiez l’état cité dans le symptôme, puis répétez le test local. ${sourceReference(anchor, 'fr')}`
  };
  return {
    symptom: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].troubleshooting])),
    checks: Object.fromEntries(LOCALES.map((locale) => [locale, [sourceReference(anchor, locale)] ])),
    resolution
  };
}

function createGuideDefinition({ name, version, entry, copy, steps, overlay, inventory = { controls: [] }, integrationInventory = { integrations: [] } }) {
  const localTestSteps = steps.filter((step) => ['run-local-preview', 'save-demo-config'].includes(step.capture.action.type)).map((step) => step.id);
  const overlaySteps = [...new Set([
    ...steps.filter((step) => step.capture.action.type === 'open-overlay-preview').map((step) => step.id),
    ...(entry.overlayWorkflowStepIds || [])
  ])];
  for (const stepId of overlaySteps) {
    if (!steps.some((step) => step.id === stepId)) {
      throw new Error(`${entry.id || name} declares unknown overlay workflow step ${stepId}`);
    }
  }
  if (overlay && !overlaySteps.length) {
    throw new Error(`${entry.id || name} declares an overlay without a source-backed workflow step`);
  }
  const inventoryControls = inventory.controls || [];
  const controlBySelector = new Map(inventoryControls.map((control) => [control.selector, control]));
  const integrations = completeIntegrations(integrationInventory.integrations);
  const anchor = sourceAnchor(entry.route, inventoryControls, integrations);
  const workflows = localizedWorkflow(name, entry.topic, entry.test, overlay, anchor);
  // The reference is derived from the shipped surface instead of silently
  // dropping controls or interfaces that the shorter golden path omits.
  const settingsReference = completeSettingReferences(steps, inventoryControls, controlBySelector, entry.route, entry.id);
  const visibleControls = completeVisibleControls(steps, inventoryControls, entry.id);

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
          `Lokale Konfigurationsoberfläche ${entry.route} im isolierten Testprofil.`,
          `Local configuration surface ${entry.route} in the isolated test profile.`,
          `Superficie de configuración local ${entry.route} en el perfil de prueba aislado.`,
          `Surface de configuration locale ${entry.route} dans le profil de test isolé.`
        )
      },
      ...(overlay ? [{
        type: 'overlay-url',
        value: overlay,
        description: localized(
          `Lokale Overlay-URL ${overlay} für eine temporäre Browserquelle.`,
          `Local overlay URL ${overlay} for a temporary browser source.`,
          `URL de overlay local ${overlay} para una fuente de navegador temporal.`,
          `URL d’overlay locale ${overlay} pour une source navigateur temporaire.`
        )
      }] : []),
      ...integrations.map((integration) => ({
        type: integration.type,
        value: integration.value,
        ...(integration.method ? { method: integration.method } : {}),
        description: integrationDescription(integration.type, integration.value, integration.method)
      }))
    ],
    troubleshooting: [localizedTroubleshooting(copy, anchor)],
    visibleControls
  };
}

module.exports = { createGuideDefinition };
