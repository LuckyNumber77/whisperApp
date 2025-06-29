import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common'; // Added
import { IonicModule } from '@ionic/angular'; // Added
import { FormsModule } from '@angular/forms'; // Added
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import * as L from 'leaflet';

interface Suggestion {
  displayName: string;
  lat: string;
  lon: string;
}

interface Threat {
  description: string;
  distance: number;
  lat: number;
  lon: number;
}

interface CrimeFeature {
  attributes: {
    Occurrence_Date: string;
    Offence: string;
    Division: string;
    Neighbourhood: string;
    Latitude: number;
    Longitude: number;
  };
  geometry: {
    x: number;
    y: number;
  };
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  coords = 'Retrieving...';
  locationInfo = 'Detecting...';
  loading = false;
  searchQuery = '';
  suggestions: Suggestion[] = [];
  selectedLocation: Suggestion | null = null;
  threats: Threat[] = [];
  radius = 5;
  viewMode: 'list' | 'map' = 'list';
  map: L.Map | null = null;
  crimeMarkers: L.LayerGroup = L.layerGroup();

  constructor(
    private http: HttpClient,
    private afAuth: AngularFireAuth,
    private router: Router
  ) {}

  ngOnInit() {
    this.requestPermissions();
  }

  ngAfterViewInit() {
    this.getLocation(); // Trigger map init after view init
  }

  ngOnDestroy() {
    if (this.map) this.map.remove();
  }

  async requestPermissions() {
    try {
      const status = await Geolocation.requestPermissions();
      if (status.location === 'granted') {
        this.getLocation();
      } else {
        this.coords = 'Permission denied';
        this.locationInfo = 'Unable to detect location';
        alert('Location permission denied. Please enable it to use this feature.');
      }
    } catch (error) {
      console.error('Permission error:', error);
      this.coords = 'Unable to get permission';
      this.locationInfo = 'Unable to detect location';
      alert('Failed to request location permissions.');
    }
  }

  async getLocation() {
    this.loading = true;
    try {
      const pos = await Geolocation.getCurrentPosition();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      this.coords = `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
      this.initMap(lat, lon);
      this.http.get<any>('https://ipapi.co/json/').subscribe(
        (data) => {
          this.locationInfo = `You are in ${data.city}, ${data.region}, ${data.country_name}`;
          this.loading = false;
        },
        (error) => {
          console.error('IP API error:', error);
          this.locationInfo = 'Unable to detect location';
          this.loading = false;
          alert('Failed to detect your location.');
        }
      );
    } catch (error) {
      console.error('Geolocation error:', error);
      this.coords = 'Unable to get location';
      this.locationInfo = 'Unable to detect location';
      this.loading = false;
      alert('Failed to retrieve your location.');
    }
  }

  onSearchInput(event: any) {
    const query = event.target.value;
    if (query.length > 2) {
      this.http
        .get<any[]>(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=ca,us&addressdetails=1&limit=5`,
          { headers: { 'User-Agent': 'WhisperApp/1.0' } }
        )
        .subscribe(
          (data) => {
            this.suggestions = data.map((item) => ({
              displayName: item.display_name,
              lat: item.lat,
              lon: item.lon,
            }));
          },
          (error) => {
            console.error('Search suggestion error:', error);
            this.suggestions = [];
            alert('Failed to load location suggestions.');
          }
        );
    } else {
      this.suggestions = [];
    }
  }

  selectLocation(suggestion: Suggestion) {
    this.searchQuery = suggestion.displayName;
    this.selectedLocation = suggestion;
    this.suggestions = [];
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);
    this.coords = `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
    this.locationInfo = suggestion.displayName;
    this.initMap(lat, lon);
  }

  search() {
    if (this.loading) return;
    this.loading = true;
    this.threats = [];
    this.clearCrimeMarkers();

    let lat: number, lon: number;
    if (this.selectedLocation) {
      lat = parseFloat(this.selectedLocation.lat);
      lon = parseFloat(this.selectedLocation.lon);
    } else {
      const match = this.coords.match(/Lat: ([\d.-]+), Lon: ([\d.-]+)/);
      if (!match) {
        alert('Please enter or detect a valid location first.');
        this.loading = false;
        return;
      }
      lat = parseFloat(match[1]);
      lon = parseFloat(match[2]);
    }

    const apiUrl =
      `https://services.arcgis.com/S9thE9n1H7JJB1yc/arcgis/rest/services/Major_Crime_Indicators/FeatureServer/0/query` +
      `?f=json` +
      `&where=1%3D1` +
      `&geometry=${lon},${lat}` +
      `&geometryType=esriGeometryPoint` +
      `&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&distance=${this.radius}` +
      `&units=esriSRUnit_Kilometer` +
      `&outFields=Occurrence_Date,Offence,Division,Neighbourhood,Latitude,Longitude` +
      `&returnGeometry=true`;

    console.log('Search coords:', lat, lon);
    console.log('Using radius:', this.radius);
    console.log('API URL:', apiUrl);

    this.http.get<any>(apiUrl).subscribe(
      (data) => {
        console.log('Crime API response:', data);
        if (!data.features || data.features.length === 0) {
          this.threats = [];
          this.loading = false;
          alert('No crime incidents found within the specified radius.');
          return;
        }

        this.threats = data.features.map((feature: CrimeFeature) => {
          const props = feature.attributes;
          const [fLon, fLat] = feature.geometry ? [feature.geometry.x, feature.geometry.y] : [props.Longitude, props.Latitude];

          if (this.viewMode === 'map' && this.map) {
            const marker = L.marker([fLat, fLon]).bindPopup(
              `${props.Offence} in ${props.Neighbourhood}`
            );
            this.crimeMarkers.addLayer(marker);
          }

          return {
            description: `${props.Offence} in ${props.Neighbourhood}`,
            distance: this.calculateDistance(lat, lon, fLat, fLon).toFixed(2),
            lat: fLat,
            lon: fLon,
          };
        });

        if (this.viewMode === 'map' && this.map) {
          this.crimeMarkers.addTo(this.map);
        }

        this.loading = false;
      },
      (error) => {
        console.error('Crime API error:', error);
        this.threats = [];
        this.loading = false;
        alert('Failed to retrieve crime data.');
      }
    );
  }

  clearCrimeMarkers() {
    if (this.map && this.crimeMarkers) {
      this.crimeMarkers.clearLayers();
    }
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  initMap(lat: number, lon: number) {
    if (this.map) {
      this.map.remove();
      this.crimeMarkers.clearLayers();
    }
    this.map = L.map('map').setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/icon/marker-icon-2x.png',
      iconUrl: 'assets/icon/marker-icon.png',
      shadowUrl: 'assets/icon/marker-shadow.png',
    });

    L.marker([lat, lon]).addTo(this.map).bindPopup('📍 You are here').openPopup();

    if (this.viewMode === 'map') {
      this.crimeMarkers.addTo(this.map);
    }
  }

  sendAlert() {
    const message = `🚨 Emergency! Location: ${this.coords}, ${this.locationInfo}`;
    console.log('Alert message:', message);
    // TODO: Integrate with SMS or sharing plugin
  }

  logout() {
    this.afAuth.signOut().then(() => this.router.navigate(['/login']));
  }
}