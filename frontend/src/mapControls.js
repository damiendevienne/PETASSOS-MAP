export class NorthControl {
  onAdd(map) {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'maplibregl-ctrl-north';
    this.button.title = 'Return to north';
    this.button.setAttribute('aria-label', 'Return map to north');
    this.button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 17 14l-5-2.5L7 14 12 2Z" fill="#c94742"/><path d="m7 14 5-2.5 5 2.5-5 8-5-8Z" fill="#9aafbe"/></svg>';
    this.onClick = () => map.resetNorth();
    this.button.addEventListener('click', this.onClick);
    this.container.append(this.button);
    return this.container;
  }

  onRemove() {
    this.button.removeEventListener('click', this.onClick);
    this.container.remove();
    this.map = undefined;
  }
}

export class TiltControl {
  onAdd(map) {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'maplibregl-ctrl-tilt';
    this.button.textContent = '3D';
    this.updateButton = () => {
      const tilted = map.getPitch() > 10;
      this.button.setAttribute('aria-pressed', String(tilted));
      this.button.title = tilted ? 'Return to 2D' : 'Tilt map to 3D';
      this.button.setAttribute('aria-label', this.button.title);
    };
    this.onClick = () => map.easeTo({ pitch: map.getPitch() > 10 ? 0 : 55, duration: 450 });
    this.button.addEventListener('click', this.onClick);
    map.on('pitchend', this.updateButton);
    this.updateButton();
    this.container.append(this.button);
    return this.container;
  }

  onRemove() {
    this.button.removeEventListener('click', this.onClick);
    this.map.off('pitchend', this.updateButton);
    this.container.remove();
    this.map = undefined;
  }
}
