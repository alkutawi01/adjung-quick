import { EDITION_IDS, getEdition } from '../../../state/editions.js';

// EditionSwitcher — UI-2A (docs/ui-2-navigation-contract.md §1, §4).
// Dispatches SWITCH_EDITION only. Deliberately labelled by EDITION identity
// ("Malaysia · Malay Edition"), never just a language name — switching
// edition rebuilds the Wheel taxonomy and Active Set from a different
// editorial universe, it does not translate the current one in place.
export default function EditionSwitcher({ activeEdition, onSwitch }) {
  return (
    <div className="edition-switcher" role="group" aria-label="Edition">
      {EDITION_IDS.map(id => {
        const edition = getEdition(id);
        const isActive = id === activeEdition;
        return (
          <button
            key={id}
            type="button"
            className={`edition-switcher__option${isActive ? ' edition-switcher__option--active' : ''}`}
            aria-pressed={isActive}
            onClick={() => { if (!isActive) onSwitch(id); }}
          >
            {edition.label}
          </button>
        );
      })}
    </div>
  );
}
