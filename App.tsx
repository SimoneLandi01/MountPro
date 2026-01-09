import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Map as MapIcon, 
  List, 
  Mountain, 
  Droplets, 
  Home, 
  Signal, 
  Sun, 
  CloudSnow, 
  Navigation,
  ChevronLeft,
  Info,
  Wind,
  ExternalLink,
  RefreshCw,
  X,
  WifiOff,
  CloudOff,
  Filter,
  Trees,
  Thermometer,
  Cloud,
  Layers,
  CloudRain,
  Loader2,
  Search,
  Compass,
  Locate,
  Clock,
  Sunset,
  Sunrise,
  Image as ImageIcon,
  Zap,
  Flame,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero,
  Smartphone,
  ArrowRight
} from 'lucide-react';
import L from 'leaflet';
import { POI, POIType, Exposure, SignalStrength } from './types';
import { MOCK_POIS } from './constants';
import { getLiveOutdoorInfo, AIResponse } from './services/geminiService';
import { fetchOsmPois, searchOsmPoisByName } from './services/osmService';

// --- Custom Hook for Click Outside ---
function useOnClickOutside(ref: React.RefObject<HTMLElement>, handler: (event: MouseEvent | TouchEvent) => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

const createCustomIcon = (type: POIType, isSelected: boolean) => {
  if (type === POIType.BIVOUAC) {
    const size = isSelected ? 44 : 34; 
    return L.divIcon({
      className: 'custom-poi-marker',
      html: `
        <div class="w-full h-full drop-shadow-2xl transition-all duration-300 origin-bottom ${isSelected ? '-translate-y-4 scale-110' : ''}">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full filter">
            <path d="M12 2C7.58 2 4 5.58 4 10C4 14.42 12 22 12 22C12 22 20 14.42 20 10C20 5.58 16.42 2 12 2Z" fill="${isSelected ? '#c2410c' : '#ea580c'}" stroke="white" stroke-width="1.5"/>
            <path d="M8 10.5L12 7L16 10.5V15H8V10.5Z" fill="white"/> 
            <rect x="10.5" y="13" width="3" height="3" fill="${isSelected ? '#c2410c' : '#ea580c'}"/>
          </svg>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size], 
      popupAnchor: [0, -size + 5]
    });
  } else if (type === POIType.FOUNTAIN) {
    const size = isSelected ? 48 : 28; 
    const bgColor = 'bg-blue-500';
    const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-7.4-1.7-2.8-3-4-4-6.6-1 2.6-2.3 3.8-4 6.6-2 3.5-3 5.4-3 7.4a7 7 0 0 0 7 7z"/></svg>`; 
    const ring = isSelected ? `ring-4 ring-white/50 shadow-2xl` : 'shadow-lg';
    return L.divIcon({
      className: 'custom-poi-marker',
      html: `
        <div class="${bgColor} ${ring} w-full h-full rounded-full border-2 border-white flex items-center justify-center transition-transform duration-300">
          ${iconSvg}
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor: [0, -size/2]
    });
  }
  return L.divIcon({ className: '' });
};

const Badge: React.FC<{ children: React.ReactNode; color?: string; icon?: React.ReactNode }> = ({ children, color = 'bg-zinc-800', icon }) => (
  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${color} text-zinc-300 flex items-center gap-1`}>
    {icon}
    {children}
  </span>
);

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('map'); 
  const [liveInfo, setLiveInfo] = useState<AIResponse | null>(null);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // --- Data Source State with Local Persistence ---
  const [allPois, setAllPois] = useState<POI[]>(() => {
    const saved = localStorage.getItem('mountpro_pois');
    return saved ? JSON.parse(saved) : MOCK_POIS;
  });

  useEffect(() => {
    localStorage.setItem('mountpro_pois', JSON.stringify(allPois));
  }, [allPois]);

  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);

  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard');
  const [showPrecipitation, setShowPrecipitation] = useState(false);
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState(false);
  const [heading, setHeading] = useState<number>(0);

  const [selectedType, setSelectedType] = useState<POIType | 'All'>(POIType.BIVOUAC);
  const [altitudeRange, setAltitudeRange] = useState<{min: number, max: number}>({ min: 0, max: 4810 });
  const [selectedExposures, setSelectedExposures] = useState<Exposure[]>([]); 

  const [filterWater, setFilterWater] = useState(false);
  const [filterRoof, setFilterRoof] = useState(false);
  const [filterElectricity, setFilterElectricity] = useState(false);
  const [filterFireplace, setFilterFireplace] = useState(false);
  const [filterSignal, setFilterSignal] = useState(false); 
  
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayerRef = useRef<L.TileLayer | null>(null); 
  const rainLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const layersMenuRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(layersMenuRef, () => setIsLayersMenuOpen(false));
  useOnClickOutside(sidebarContentRef, () => setIsSidebarOpen(false));
  useOnClickOutside(detailPanelRef, () => setIsDetailPanelOpen(false));

  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const selectedTypeRef = useRef(selectedType);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { selectedTypeRef.current = selectedType; }, [selectedType]);

  useEffect(() => {
    (window as any).openMountProDetails = () => {
       setIsDetailPanelOpen(true);
    };
    return () => {
      delete (window as any).openMountProDetails;
    }
  }, []);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const compass = (event as any).webkitCompassHeading || Math.abs(event.alpha! - 360);
      if (compass) setHeading(compass);
    };
    if (window.DeviceOrientationEvent) window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  const handleNavigation = () => {
    if (!selectedPoi) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedPoi.coordinates.lat},${selectedPoi.coordinates.lng}`;
    window.open(url, '_blank');
  };

  const handleOpenReviews = () => {
    if (!selectedPoi) return;
    if (liveInfo?.data?.google_maps_url) {
       window.open(liveInfo.data.google_maps_url, '_blank');
    } else {
       const query = encodeURIComponent(selectedPoi.name);
       window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    }
  };

  const renderSignalBars = (level: number) => {
      return (
          <div className="flex items-end gap-1 h-5">
              {[1, 2, 3, 4].map((bar) => (
                  <div 
                    key={bar}
                    className={`w-1.5 rounded-sm transition-all duration-500 ${level >= bar ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-700/50'}`}
                    style={{ height: `${bar * 25}%` }}
                  />
              ))}
          </div>
      );
  };

  const getSignalLevel = (poiSignal: SignalStrength, aiData?: any): number => {
    if (aiData && typeof aiData.strength === 'number') return aiData.strength;
    switch (poiSignal) {
        case SignalStrength.EXCELLENT: return 4;
        case SignalStrength.HIGH: return 3;
        case SignalStrength.MEDIUM: return 2;
        case SignalStrength.LOW: return 1;
        default: return 0;
    }
  };

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    if (isOffline) {
      // Offline search: search in stored POIs
      const localResults = allPois.filter(p => p.name.toLowerCase().includes(query));
      if (localResults.length > 0) {
        setSelectedPoi(localResults[0]);
        setIsDetailPanelOpen(true);
        if (mapRef.current) mapRef.current.flyTo([localResults[0].coordinates.lat, localResults[0].coordinates.lng], 15);
      }
      return;
    }

    setIsGlobalSearching(true);
    setViewMode('map');
    const results = await searchOsmPoisByName(searchQuery);
    if (results.length > 0) {
      setAllPois(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const uniqueNew = results.filter(p => !existingIds.has(p.id));
        return [...prev, ...uniqueNew];
      });
      setSelectedPoi(results[0]);
      setIsDetailPanelOpen(true);
      if (mapRef.current) mapRef.current.flyTo([results[0].coordinates.lat, results[0].coordinates.lng], 16, { duration: 1.5 });
    }
    setIsGlobalSearching(false);
  };

  const executeFetch = async () => {
    if (!mapRef.current || isOffline) return;
    if (fetchAbortControllerRef.current) fetchAbortControllerRef.current.abort();
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;
    setIsSearchingArea(true);
    const bounds = mapRef.current.getBounds();
    try {
      const newPois = await fetchOsmPois({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
      }, selectedTypeRef.current, controller.signal);
      if (controller.signal.aborted) return;
      setAllPois(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const uniqueNewPois = newPois.filter(p => !existingIds.has(p.id));
        return [...prev, ...uniqueNewPois]; 
      });
    } catch (err) {} finally {
      if (!controller.signal.aborted) {
        setIsSearchingArea(false);
        fetchAbortControllerRef.current = null;
      }
    }
  };

  const filteredPois = useMemo(() => {
    return allPois.filter(poi => {
      const matchesType = selectedType === 'All' || poi.type === selectedType;
      const matchesAltitude = (poi.altitude === 0) || (poi.altitude >= altitudeRange.min && poi.altitude <= altitudeRange.max);
      const matchesExposure = selectedExposures.length === 0 ? true : selectedExposures.includes(poi.exposure) || poi.exposure === Exposure.VARIOUS;
      const matchesSignal = !filterSignal || poi.signal !== SignalStrength.NONE; 
      const matchesWater = !filterWater || poi.hasWater;
      const matchesRoof = !filterRoof || poi.hasRoof;
      const matchesElectricity = !filterElectricity || poi.hasElectricity;
      const matchesFireplace = !filterFireplace || poi.hasFireplace;
      return matchesType && matchesAltitude && matchesExposure && matchesSignal && matchesWater && matchesRoof && matchesElectricity && matchesFireplace;
    });
  }, [allPois, selectedType, altitudeRange, selectedExposures, filterSignal, filterWater, filterRoof, filterElectricity, filterFireplace]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([46.2, 11.4], 9);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
      mapRef.current = map;
      const onMoveEnd = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => executeFetch(), 600); 
      };
      map.on('moveend', onMoveEnd);
      if (!isOffline) onMoveEnd();
    }
    if (mapRef.current) {
      const map = mapRef.current;
      const markers = markersRef.current;
      const filteredIds = new Set(filteredPois.map(p => p.id));
      markers.forEach((marker, id) => {
        if (!filteredIds.has(id)) { map.removeLayer(marker); markers.delete(id); }
      });
      filteredPois.forEach(poi => {
        const isSelected = selectedPoi?.id === poi.id;
        const popupContent = `<div class="font-sans p-1 min-w-[150px]"><h3 class="font-bold text-sm text-zinc-100 mb-0.5">${poi.name}</h3><div class="flex items-center gap-2 text-[10px] text-zinc-400 mb-2 uppercase tracking-wide"><span>${poi.type}</span> • <span>${poi.altitude}m</span></div><button onclick="window.openMountProDetails()" class="w-full bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Apri Scheda</button></div>`;
        if (markers.has(poi.id)) {
          const marker = markers.get(poi.id)!;
          marker.setIcon(createCustomIcon(poi.type, isSelected));
          marker.setZIndexOffset(isSelected ? 2000 : 0);
          if (!marker.getPopup()) marker.bindPopup(popupContent, { closeButton: false, offset: [0, -6] });
        } else {
          const marker = L.marker([poi.coordinates.lat, poi.coordinates.lng], { icon: createCustomIcon(poi.type, isSelected) }).addTo(map);
          marker.bindPopup(popupContent, { closeButton: false, offset: [0, -6] });
          marker.on('click', () => { setSelectedPoi(poi); marker.openPopup(); setIsDetailPanelOpen(false); });
          markers.set(poi.id, marker);
        }
      });
    }
  }, [viewMode, filteredPois, selectedPoi]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (baseLayerRef.current) mapRef.current.removeLayer(baseLayerRef.current);
    if (overlayLayerRef.current) mapRef.current.removeLayer(overlayLayerRef.current);
    if (mapStyle === 'standard') {
      baseLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'dark-tiles' }).addTo(mapRef.current);
    } else {
      baseLayerRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(mapRef.current);
      overlayLayerRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, zIndex: 50 }).addTo(mapRef.current);
    }
  }, [mapStyle, viewMode]);

  useEffect(() => {
    if (selectedPoi && isDetailPanelOpen && !isOffline) {
        setIsLoadingLive(true);
        getLiveOutdoorInfo(selectedPoi).then(data => { setLiveInfo(data); setIsLoadingLive(false); });
    }
  }, [selectedPoi, isDetailPanelOpen, isOffline]);

  const toggleExposure = (exp: Exposure) => {
    setSelectedExposures(prev => prev.includes(exp) ? prev.filter(e => e !== exp) : [...prev, exp]);
  };

  const minPos = useMemo(() => Math.min(Math.max((altitudeRange.min / 4810) * 100, 0), 100), [altitudeRange.min]);
  const maxPos = useMemo(() => Math.min(Math.max((altitudeRange.max / 4810) * 100, 0), 100), [altitudeRange.max]);

  return (
    <div className="flex h-screen w-full bg-zinc-950 overflow-hidden text-zinc-200 font-sans">
      <aside className={`fixed inset-0 z-[5000] w-full h-full sm:max-w-md ml-auto bg-transparent transition-transform duration-300 ease-in-out flex flex-col pointer-events-none ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div ref={sidebarContentRef} className="h-full w-full bg-zinc-900 border-l border-zinc-800 flex flex-col pointer-events-auto shadow-2xl">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 shrink-0">
            <button onClick={() => setIsSidebarOpen(false)} className="flex items-center gap-1 text-zinc-300 hover:text-white p-2 rounded-lg hover:bg-zinc-800"><ChevronLeft className="w-5 h-5" /><span className="text-sm font-medium">Indietro</span></button>
            <h1 className="text-lg font-bold">Filtri</h1>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
             <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase">Tipologia</h3>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setSelectedType('All')} className={`flex-1 px-4 py-3 rounded-lg text-sm border ${selectedType === 'All' ? 'bg-zinc-100 text-black' : 'bg-zinc-800 border-zinc-700'}`}>Tutti</button>
                <button onClick={() => setSelectedType(POIType.BIVOUAC)} className={`flex-1 px-4 py-3 rounded-lg text-sm border ${selectedType === POIType.BIVOUAC ? 'bg-orange-600 border-orange-600' : 'bg-zinc-800 border-zinc-700'}`}>Bivacchi</button>
                <button onClick={() => setSelectedType(POIType.FOUNTAIN)} className={`flex-1 px-4 py-3 rounded-lg text-sm border ${selectedType === POIType.FOUNTAIN ? 'bg-blue-600 border-blue-600' : 'bg-zinc-800 border-zinc-700'}`}>Fontane</button>
              </div>
             </div>
             <div className="space-y-5">
               <div className="flex justify-between items-center"><h3 className="text-xs font-bold text-zinc-500 uppercase">Altitudine</h3><span className="text-xs font-mono text-orange-500">{altitudeRange.min}m - {altitudeRange.max}m</span></div>
               <div className="relative h-6 w-full range-slider-container">
                 <div className="absolute top-2.5 left-0 w-full h-1 bg-zinc-700 rounded z-0"></div>
                 <div className="absolute top-2.5 h-1 bg-orange-600 rounded z-10" style={{ left: `${minPos}%`, width: `${maxPos - minPos}%` }}></div>
                 <input type="range" min="0" max="4810" value={altitudeRange.min} onChange={(e) => setAltitudeRange(p => ({...p, min: Math.min(Number(e.target.value), altitudeRange.max - 100)}))} className="absolute top-0 w-full appearance-none bg-transparent pointer-events-none"/>
                 <input type="range" min="0" max="4810" value={altitudeRange.max} onChange={(e) => setAltitudeRange(p => ({...p, max: Math.max(Number(e.target.value), altitudeRange.min + 100)}))} className="absolute top-0 w-full appearance-none bg-transparent pointer-events-none"/>
               </div>
             </div>
             <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase">Esposizione</h3>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setSelectedExposures([])} className={`px-2 py-2 rounded-lg text-xs border ${selectedExposures.length === 0 ? 'bg-zinc-100 text-black' : 'bg-zinc-800 border-zinc-700'}`}>Tutti</button>
                {Object.values(Exposure).filter(e => e !== Exposure.VARIOUS).map(exp => (
                  <button key={exp} onClick={() => toggleExposure(exp)} className={`px-2 py-2 rounded-lg text-xs border ${selectedExposures.includes(exp) ? 'bg-orange-900/40 text-orange-400 border-orange-500' : 'bg-zinc-800 border-zinc-700'}`}>{exp}</button>
                ))}
              </div>
             </div>
             <div className="space-y-4">
               <h3 className="text-xs font-bold text-zinc-500 uppercase">Servizi</h3>
               <div className="grid grid-cols-2 gap-3">
                 <button onClick={() => setFilterWater(!filterWater)} className={`p-4 border rounded-xl flex flex-col items-center gap-2 transition-all ${filterWater ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-zinc-800 border-zinc-700'}`}><Droplets size={20}/> <span className="text-xs">Acqua</span></button>
                 <button onClick={() => setFilterRoof(!filterRoof)} className={`p-4 border rounded-xl flex flex-col items-center gap-2 transition-all ${filterRoof ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-zinc-800 border-zinc-700'}`}><Home size={20}/> <span className="text-xs">Coperto</span></button>
               </div>
             </div>
          </div>
        </div>
      </aside>

      <main className="w-full h-full relative bg-zinc-950 overflow-hidden">
        <header className="absolute top-6 left-4 right-4 z-[2000] flex items-center justify-between gap-3 pointer-events-none">
          <button onClick={() => setViewMode(v => v === 'list' ? 'map' : 'list')} className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-zinc-900/90 border border-zinc-700/50 rounded-xl text-zinc-300 hover:text-white shadow-lg backdrop-blur-md">{viewMode === 'list' ? <MapIcon size={20}/> : <List size={20}/>}</button>
          <form onSubmit={handleGlobalSearch} className="flex-1 max-w-md relative pointer-events-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={isOffline ? "Cerca tra i salvati..." : "Cerca bivacco o fonte..."} className="w-full h-10 bg-zinc-900/90 border border-zinc-700/50 text-zinc-200 text-sm rounded-xl pl-9 pr-4 focus:ring-2 focus:ring-orange-500/50 outline-none backdrop-blur-md"/>
            {isOffline && <CloudOff className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" title="Offline"/>}
          </form>
          <button onClick={() => setIsSidebarOpen(true)} className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-zinc-900/90 border border-zinc-700/50 rounded-xl text-zinc-300 hover:text-white shadow-lg backdrop-blur-md"><Filter size={18}/></button>
        </header>

        {isOffline && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1500] bg-orange-600/20 border border-orange-500/50 text-orange-500 text-[10px] font-bold px-3 py-1 rounded-full backdrop-blur-md flex items-center gap-2">
            <WifiOff size={10}/> MODALITÀ ARCHIVIO LOCALE
          </div>
        )}

        <div className="w-full h-full bg-zinc-900">
          {viewMode === 'list' ? (
            <div className="p-6 pt-36 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20 overflow-y-auto h-full">
               {filteredPois.map(poi => (
                  <div key={poi.id} onClick={() => { setSelectedPoi(poi); setIsDetailPanelOpen(true); setViewMode('map'); }} className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden cursor-pointer hover:border-zinc-500 transition-all group">
                    <div className="h-44 bg-zinc-800 relative"><img src={poi.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"/></div>
                    <div className="p-4"><div className="text-[10px] text-orange-500 font-bold uppercase mb-1">{poi.type}</div><h3 className="font-bold text-zinc-100">{poi.name}</h3><div className="flex justify-between mt-3 text-xs text-zinc-500"><span className="flex items-center gap-1"><Mountain size={12}/> {poi.altitude}m</span><span>{poi.exposure}</span></div></div>
                  </div>
               ))}
            </div>
          ) : <div ref={mapContainerRef} className="h-full w-full" />}
        </div>

        {selectedPoi && isDetailPanelOpen && (
          <div ref={detailPanelRef} className="absolute inset-y-0 right-0 w-full sm:w-[450px] bg-zinc-950 border-l border-zinc-800 shadow-2xl z-[3000] flex flex-col animate-in slide-in-from-right duration-300">
             <div className="p-4 border-b border-zinc-800 flex justify-between items-center sticky top-0 bg-zinc-950/95 backdrop-blur-md z-10">
              <button onClick={() => setIsDetailPanelOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400"><ChevronLeft/></button>
              <h3 className="font-bold uppercase tracking-widest text-[10px] text-zinc-500">Dettagli</h3>
            </div>
            <div className="flex-1 overflow-y-auto hide-scrollbar">
               <div className="relative h-64"><img src={selectedPoi.imageUrl} className="w-full h-full object-cover" /><div className="absolute bottom-4 left-6"><Badge color="bg-orange-600 text-white border-none">{selectedPoi.type}</Badge><h2 className="text-3xl font-bold text-white shadow-black drop-shadow-md">{selectedPoi.name}</h2></div></div>
               <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                     <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800"><span className="text-[10px] text-zinc-500 uppercase font-bold">Altitudine</span><div className="text-lg font-bold text-white flex items-center gap-2"><Mountain size={18}/> {selectedPoi.altitude}m</div></div>
                     <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800"><span className="text-[10px] text-zinc-500 uppercase font-bold">Esposizione</span><div className="text-lg font-bold text-white flex items-center gap-2"><Sun size={18}/> {selectedPoi.exposure}</div></div>
                  </div>
                  <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800"><span className="text-[10px] text-zinc-500 uppercase font-bold mb-3 block">Dotazioni</span><div className="flex gap-4">{selectedPoi.hasWater && <div className="text-blue-400 flex items-center gap-2 text-sm"><Droplets size={16}/> Acqua</div>}{selectedPoi.hasRoof && <div className="text-emerald-400 flex items-center gap-2 text-sm"><Home size={16}/> Coperto</div>}{selectedPoi.hasElectricity && <div className="text-yellow-400 flex items-center gap-2 text-sm"><Zap size={16}/> Corrente</div>}{selectedPoi.hasFireplace && <div className="text-red-400 flex items-center gap-2 text-sm"><Flame size={16}/> Stufa</div>}</div></div>
                  <div><h4 className="text-xs font-bold text-zinc-400 uppercase mb-2">Descrizione</h4><p className="text-sm text-zinc-300 leading-relaxed bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">{selectedPoi.description}</p></div>
                  <button onClick={handleNavigation} className="w-full font-bold py-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center gap-2 transition-all"><Navigation size={20}/> Avvia Navigazione</button>
               </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
