import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import { 
  LocateFixed, Search, Menu, Filter, IceCream, Wrench, Sparkles, Wind, BookOpen, 
  PawPrint, Key, Hammer, Recycle, MoreHorizontal,
  Star, Heart, Zap, Briefcase, Truck, Music, Scissors, Coffee, X, Bike
} from 'lucide-react';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const SINGAPORE_CENTER: [number, number] = [1.3521, 103.8198];

function MapUpdater({ focus, user }: { focus: [number, number] | null, user: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus && user) {
      const bounds = L.latLngBounds([user, focus]);
      map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5, maxZoom: 16 });
    } else if (focus) {
      map.flyTo(focus, 15, { duration: 1.5 });
    }
  }, [focus, user, map]);
  return null;
}

function LocationMarker({ setUserLocation }: { setUserLocation: (loc: [number, number]) => void }) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const map = useMap();

  useEffect(() => {
    map.locate({ setView: false }).on("locationfound", function (e) {
      const loc: [number, number] = [e.latlng.lat, e.latlng.lng];
      setPosition(loc);
      setUserLocation(loc);
      // Only fly to user location on initial load
      if (!position) {
        map.flyTo(e.latlng, 14);
      }
    });
  }, [map]); // omitted dependencies to prevent infinite loop

  return position === null ? null : (
    <Marker position={position}>
      <Popup>You are here!</Popup>
    </Marker>
  );
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const CATEGORIES = [
  { name: 'Desserts', icon: IceCream, color: 'text-pink-600', bg: 'bg-pink-100', border: 'border-pink-200' },
  { name: 'Aircon Wash', icon: Wind, color: 'text-cyan-600', bg: 'bg-cyan-100', border: 'border-cyan-200' },
  { name: 'Karang Guni', icon: Recycle, color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-200' },
  { name: 'Repairs', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' },
  { name: 'Tutors', icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-100', border: 'border-indigo-200' },
  { name: 'Pet Grooming', icon: PawPrint, color: 'text-amber-600', bg: 'bg-amber-100', border: 'border-amber-200' },
  { name: 'Locksmith', icon: Key, color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-200' },
  { name: 'Cobbler', icon: Hammer, color: 'text-stone-600', bg: 'bg-stone-100', border: 'border-stone-200' },
  { name: 'Cleaning', icon: Sparkles, color: 'text-teal-600', bg: 'bg-teal-100', border: 'border-teal-200' },
  { name: 'Others', icon: MoreHorizontal, color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
];

const CUSTOM_ICONS = {
  Star, Heart, Zap, Briefcase, Truck, Music, Scissors, Coffee
};

export default function App() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const [isBottomSheetOpen, setBottomSheetOpen] = useState(true);
  const [isProviderMode, setIsProviderMode] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [focusLocation, setFocusLocation] = useState<[number, number] | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);
  const [transportMode, setTransportMode] = useState<'driving' | 'foot' | 'bike'>('driving');
  const [routeMetrics, setRouteMetrics] = useState<{distance: number, duration: number} | null>(null);
  
  const [providerData, setProviderData] = useState({ 
    name: '', category: 'Desserts', startTime: '09:00', endTime: '18:00', description: '', address: '', isLive: false, location: null as [number, number] | null,
    customCategoryName: '', customCategoryIcon: 'Star' as keyof typeof CUSTOM_ICONS
  });
  
  const [liveProviders, setLiveProviders] = useState<any[]>([]);

  useEffect(() => {
    // Fetch live providers every 10 seconds
    const fetchProviders = async () => {
      try {
        const res = await fetch(`${API_URL}/api/providers/live`);
        const data = await res.json();
        setLiveProviders(data);
      } catch (err) {
        console.error("Failed to fetch live providers", err);
      }
    };
    
    fetchProviders();
    const interval = setInterval(fetchProviders, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch real street routing when a service is clicked or transport mode changes
  useEffect(() => {
    if (userLocation && focusLocation && !isProviderMode) {
      const fetchRoute = async () => {
        try {
          // Use specific openstreetmap.de instances for different transport modes
          let baseUrl = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
          if (transportMode === 'foot') {
            baseUrl = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
          } else if (transportMode === 'bike') {
            baseUrl = 'https://routing.openstreetmap.de/routed-bike/route/v1/driving';
          }
          
          const url = `${baseUrl}/${userLocation[1]},${userLocation[0]};${focusLocation[1]},${focusLocation[0]}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            // GeoJSON returns [longitude, latitude], Leaflet needs [latitude, longitude]
            const coords = data.routes[0].geometry.coordinates.map((c: any[]) => [c[1], c[0]] as [number, number]);
            setRoutePath(coords);
            setRouteMetrics({
              distance: data.routes[0].distance,
              duration: data.routes[0].duration
            });
          } else {
            setRoutePath([userLocation, focusLocation]); // fallback to straight line
            setRouteMetrics(null);
          }
        } catch(e) {
          console.error("Routing failed", e);
          setRoutePath([userLocation, focusLocation]); // fallback
          setRouteMetrics(null);
        }
      };
      fetchRoute();
    } else {
      setRoutePath(null);
      setRouteMetrics(null);
    }
  }, [userLocation, focusLocation, isProviderMode, transportMode]);

  const toggleLiveStatus = async () => {
    if (!providerData.location || !providerData.name) {
      alert("Please provide a Business Name and pinpoint your location first!");
      return;
    }
    const newStatus = !providerData.isLive;
    setProviderData({...providerData, isLive: newStatus});
    
    const formatTime = (time24h: string) => {
      if (!time24h) return '';
      const [h, m] = time24h.split(':');
      let hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      return `${hour}:${m} ${ampm}`;
    };
    
    const timingString = `${formatTime(providerData.startTime)} - ${formatTime(providerData.endTime)}`;

    let finalCategory = providerData.category;
    if (finalCategory === 'Others') {
      if (!providerData.customCategoryName.trim()) {
        alert("Please enter a name for your custom category.");
        return;
      }
      finalCategory = `__CUSTOM__${providerData.customCategoryIcon}__${providerData.customCategoryName}`;
    }

    try {
      await fetch(`${API_URL}/api/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...providerData, category: finalCategory, timing: timingString, isLive: newStatus })
      });
    } catch (err) {
      console.error("Failed to update broadcast status", err);
      alert("Failed to connect to backend!");
      setProviderData({...providerData, isLive: !newStatus}); // Revert
    }
  };

  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<any[]>([]);

  const searchOneMap = async (query: string) => {
    setAddressQuery(query);
    if (query.length < 3) {
      setAddressResults([]);
      return;
    }
    try {
      const res = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`);
      const data = await res.json();
      setAddressResults(data.results.slice(0, 4));
    } catch (e) {
      console.error(e);
    }
  };

  const parseCategory = (catString: string) => {
    if (catString.startsWith('__CUSTOM__')) {
      const parts = catString.split('__');
      const iconName = parts[2] as keyof typeof CUSTOM_ICONS;
      const catName = parts[3];
      const IconComp = CUSTOM_ICONS[iconName] || Star;
      return { name: catName, icon: IconComp, bg: 'bg-purple-100', color: 'text-purple-600', border: 'border-purple-200' };
    }
    return CATEGORIES.find(c => c.name === catString) || CATEGORIES[0];
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gray-100">
      
      {/* Floating Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <button 
            className="bg-white p-3 rounded-full shadow-lg border border-gray-100 hover:bg-gray-50 transition-colors"
            onClick={() => {
              setIsProviderMode(!isProviderMode);
              setBottomSheetOpen(true);
            }}
          >
            <Menu className="w-6 h-6 text-gray-700" />
          </button>
          
          <div className="bg-white px-5 py-3 rounded-full shadow-lg border border-gray-100 flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <span className="font-bold text-gray-800 tracking-tight">Pied Piper Local</span>
          </div>

          <button 
            className="bg-indigo-600 p-3 rounded-full shadow-lg text-white hover:bg-indigo-700 transition-colors"
            onClick={() => {
               // In a real app, this triggers map.locate()
               alert("Re-centering on your location...");
            }}
          >
            <LocateFixed className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* The Map */}
      <MapContainer 
        center={SINGAPORE_CENTER} 
        zoom={13} 
        zoomControl={false}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <LocationMarker setUserLocation={setUserLocation} />
        <MapUpdater 
          focus={isProviderMode ? providerData.location : focusLocation} 
          user={isProviderMode ? null : userLocation} 
        />
        
        {/* Navigation Line */}
        {routePath && !isProviderMode && (
          <Polyline 
            positions={routePath} 
            pathOptions={{ color: transportMode === 'driving' ? '#4f46e5' : transportMode === 'foot' ? '#10b981' : '#f59e0b', weight: 5, lineCap: 'round', lineJoin: 'round', opacity: 0.8 }} 
          />
        )}
        
        {providerData.location && isProviderMode && (
          <Marker position={providerData.location}>
            <Popup>Your Service Location</Popup>
          </Marker>
        )}
        
        {/* Floating Route Info Panel */}
        {focusLocation && !isProviderMode && routeMetrics && (
          <div className="absolute top-24 left-4 right-4 z-[1001] bg-white p-4 rounded-2xl shadow-xl border border-gray-100 flex flex-col space-y-3">
             <div className="flex justify-between items-center">
                <div>
                   <div className="text-sm font-bold text-gray-900">Route to Destination</div>
                   <div className="text-xs font-semibold text-gray-500">{(routeMetrics.distance / 1000).toFixed(1)} km • {Math.round(routeMetrics.duration / 60)} min</div>
                </div>
                <button 
                  onClick={() => { setFocusLocation(null); setRoutePath(null); setBottomSheetOpen(true); }} 
                  className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
             </div>
             
             <div className="flex space-x-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
                <button 
                  onClick={() => setTransportMode('driving')} 
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs transition-all ${transportMode === 'driving' ? 'bg-white shadow-sm font-bold text-indigo-600' : 'text-gray-500 font-medium hover:bg-gray-200'}`}
                >
                  <Truck className="w-3.5 h-3.5 mr-1.5"/> Car
                </button>
                <button 
                  onClick={() => setTransportMode('foot')} 
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs transition-all ${transportMode === 'foot' ? 'bg-white shadow-sm font-bold text-emerald-600' : 'text-gray-500 font-medium hover:bg-gray-200'}`}
                >
                  <LocateFixed className="w-3.5 h-3.5 mr-1.5"/> Walk
                </button>
                <button 
                  onClick={() => setTransportMode('bike')} 
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs transition-all ${transportMode === 'bike' ? 'bg-white shadow-sm font-bold text-amber-500' : 'text-gray-500 font-medium hover:bg-gray-200'}`}
                >
                  <Bike className="w-3.5 h-3.5 mr-1.5"/> Bike
                </button>
             </div>
          </div>
        )}
        
        {/* Render Live Providers on the Customer Map */}
        {!isProviderMode && liveProviders.map(p => {
          const catInfo = parseCategory(p.category);
          return (
            <Marker key={p.id} position={[p.latitude, p.longitude]}>
              <Popup>
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1 mb-1">
                    <catInfo.icon className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{catInfo.name}</span>
                  </div>
                  <div className="font-bold text-gray-900">{p.businessName}</div>
                  <div className="text-xs text-gray-500 mb-1">{p.openingHours || 'No timing specified'}</div>
                  <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">LIVE NOW</span>
                  {p.description && <div className="mt-2 text-xs italic text-gray-600 border-t pt-1">"{p.description}"</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Draggable Bottom Sheet */}
      <div className={`absolute left-0 right-0 z-[1000] bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-transform duration-500 ease-in-out ${isBottomSheetOpen ? 'bottom-0' : '-bottom-[60%]'}`} style={{ height: '70vh' }}>
        
        {/* Drag Handle */}
        <div 
          className="w-full flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing"
          onClick={() => setBottomSheetOpen(!isBottomSheetOpen)}
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
        </div>

        <div className="px-6 py-2 h-full overflow-y-auto">
          {!isProviderMode ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Find nearby services</h2>
              
              {/* Search Bar */}
              <div className="flex space-x-2 mb-6">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    type="text" 
                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" 
                    placeholder="Aircon servicing, ice cream..." 
                  />
                </div>
                <button className="bg-indigo-50 text-indigo-600 p-3 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors">
                  <Filter className="w-5 h-5" />
                </button>
              </div>

              {/* Categories */}
              <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-hide">
                {CATEGORIES.map((category, idx) => (
                  <div key={idx} className="flex flex-col items-center space-y-2 min-w-[80px] cursor-pointer hover:opacity-80 transition-opacity">
                    <div className={`w-16 h-16 rounded-full ${category.bg} flex items-center justify-center ${category.color} shadow-sm border ${category.border}`}>
                      <category.icon className="w-8 h-8" />
                    </div>
                    <span className="text-xs font-semibold text-gray-700">{category.name}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <h3 className="text-lg font-bold text-gray-800 mb-3">Live Near You</h3>
                
                {/* Service Cards from Backend */}
                {liveProviders.length === 0 ? (
                  <p className="text-sm text-gray-500 italic py-4">No services are live near you right now.</p>
                ) : (
                  liveProviders.map(p => {
                    const catInfo = parseCategory(p.category);
                    const distKm = userLocation ? calculateDistance(userLocation[0], userLocation[1], p.latitude, p.longitude) : null;
                    const walkMins = distKm ? Math.max(1, Math.round(distKm * 12)) : null; // roughly 12 mins per km walking
                    const carMins = distKm ? Math.max(1, Math.round(distKm * 2)) : null;   // roughly 2 mins per km driving in city
                    
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => {
                          setFocusLocation([p.latitude, p.longitude]);
                          setBottomSheetOpen(false); // minimize sheet to show map
                        }}
                        className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex items-center space-x-4 mb-3 cursor-pointer hover:border-indigo-200"
                      >
                        <div className={`w-16 h-16 rounded-xl ${catInfo.bg} flex items-center justify-center ${catInfo.color} shrink-0 border ${catInfo.border}`}>
                          <catInfo.icon className="w-8 h-8" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-gray-900 truncate pr-2">{p.businessName}</h4>
                            <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-full shrink-0">LIVE</span>
                          </div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{catInfo.name}</div>
                          <div className="flex items-center text-xs font-medium text-gray-600 mb-1">
                            {distKm !== null && (
                              <>
                                <span className="font-bold text-gray-900 mr-2">{distKm.toFixed(1)} km</span>
                                <span className="flex items-center mr-2 text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md"><Truck className="w-3 h-3 mr-1" /> {carMins}m</span>
                                <span className="flex items-center text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md"><LocateFixed className="w-3 h-3 mr-1" /> {walkMins}m walk</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center text-[11px] font-medium text-indigo-500">
                            <span className="truncate">Active • {p.openingHours}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="pb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-indigo-900">Provider Dashboard</h2>
                <span className="text-sm px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full font-bold">Service Mode</span>
              </div>
              <p className="text-gray-500 text-sm mb-6">Set up your business and broadcast your location to customers nearby.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                  <input 
                    type="text" 
                    value={providerData.name}
                    onChange={(e) => setProviderData({...providerData, name: e.target.value})}
                    placeholder="e.g. Uncle Tan's Aircon Service" 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <div className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide">
                    {CATEGORIES.map((category, idx) => {
                      const isSelected = providerData.category === category.name;
                      return (
                        <div 
                          key={idx} 
                          onClick={() => setProviderData({...providerData, category: category.name})}
                          className={`flex flex-col items-center space-y-2 min-w-[80px] cursor-pointer transition-all ${isSelected ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}
                        >
                          <div className={`w-16 h-16 rounded-full ${category.bg} flex items-center justify-center ${category.color} shadow-sm border ${isSelected ? 'border-2 border-indigo-500' : category.border}`}>
                            <category.icon className="w-8 h-8" />
                          </div>
                          <span className={`text-xs font-semibold ${isSelected ? 'text-indigo-700' : 'text-gray-500'}`}>{category.name}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {providerData.category === 'Others' && (
                    <div className="mt-4 p-4 bg-purple-50 rounded-2xl border border-purple-100">
                      <label className="block text-xs font-bold text-purple-900 mb-2 uppercase tracking-wider">Name your custom service</label>
                      <input 
                        type="text" 
                        value={providerData.customCategoryName}
                        onChange={(e) => setProviderData({...providerData, customCategoryName: e.target.value})}
                        placeholder="e.g. Balloon Sculpting" 
                        className="w-full px-4 py-3 rounded-xl border border-purple-200 text-gray-900 bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none mb-4"
                      />
                      
                      <label className="block text-xs font-bold text-purple-900 mb-2 uppercase tracking-wider">Choose an icon</label>
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(CUSTOM_ICONS).map(([name, Icon]) => {
                          const isSelected = providerData.customCategoryIcon === name;
                          return (
                            <div 
                              key={name}
                              onClick={() => setProviderData({...providerData, customCategoryIcon: name as any})}
                              className={`w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${isSelected ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-purple-600 border border-purple-200 hover:bg-purple-100'}`}
                            >
                              <Icon className="w-6 h-6" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operating Hours</label>
                  <div className="flex space-x-2 mb-3">
                    <div className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 flex items-center">
                      <span className="text-xs text-gray-400 font-bold mr-2">START</span>
                      <input 
                        type="time" 
                        value={providerData.startTime}
                        onChange={(e) => setProviderData({...providerData, startTime: e.target.value})}
                        className="w-full text-gray-900 bg-transparent focus:outline-none"
                      />
                    </div>
                    <div className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 flex items-center">
                      <span className="text-xs text-gray-400 font-bold mr-2">END</span>
                      <input 
                        type="time" 
                        value={providerData.endTime}
                        onChange={(e) => setProviderData({...providerData, endTime: e.target.value})}
                        className="w-full text-gray-900 bg-transparent focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setProviderData({...providerData, startTime: '08:00', endTime: '12:00'})} className="px-3 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors active:scale-95">+ Morning</button>
                    <button onClick={() => setProviderData({...providerData, startTime: '12:00', endTime: '17:00'})} className="px-3 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors active:scale-95">+ Afternoon</button>
                    <button onClick={() => setProviderData({...providerData, startTime: '17:00', endTime: '22:00'})} className="px-3 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors active:scale-95">+ Evening</button>
                    <button onClick={() => setProviderData({...providerData, startTime: '09:00', endTime: '21:00'})} className="px-3 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors active:scale-95">+ All Day</button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea 
                    value={providerData.description}
                    onChange={(e) => setProviderData({...providerData, description: e.target.value})}
                    placeholder="e.g. I sell traditional ice cream blocks, look for the red umbrella!" 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none h-24"
                  />
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <h4 className="font-bold text-gray-900 mb-1">Pinpoint Location</h4>
                  <p className="text-xs text-gray-500 mb-3">Search for your HDB block or postal code to drop a pin.</p>
                  
                  <div className="relative">
                    <input 
                      type="text" 
                      value={addressQuery}
                      onChange={(e) => searchOneMap(e.target.value)}
                      placeholder="Search postal code or street..." 
                      className="w-full px-4 py-3 pl-10 rounded-xl border border-gray-200 text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                    
                    {addressResults.length > 0 && (
                      <div className="absolute z-[1001] w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                        {addressResults.map((res, i) => (
                          <div 
                            key={i} 
                            className="p-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              const lat = parseFloat(res.LATITUDE);
                              const lng = parseFloat(res.LONGITUDE);
                              setProviderData({ ...providerData, address: res.SEARCHVAL, location: [lat, lng] });
                              setAddressQuery(res.SEARCHVAL);
                              setAddressResults([]);
                            }}
                          >
                            <div className="text-sm font-bold text-gray-900">{res.SEARCHVAL}</div>
                            <div className="text-xs text-gray-500">{res.ADDRESS}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {providerData.address && (
                    <div className="mt-3 flex items-center text-sm text-green-600 bg-green-50 p-3 rounded-xl border border-green-100">
                      <LocateFixed className="w-5 h-5 mr-2 shrink-0" />
                      <span className="font-semibold truncate">Pinned at: {providerData.address}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-gray-900">Broadcast Status</h4>
                      <p className="text-xs text-gray-500">Go live for customers to see you.</p>
                    </div>
                    <button 
                      onClick={toggleLiveStatus}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${providerData.isLive ? 'bg-green-500' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition duration-300 ${providerData.isLive ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                <button 
                  onClick={toggleLiveStatus}
                  className={`w-full py-4 mt-6 rounded-2xl font-bold text-white shadow-lg transition-all ${providerData.isLive ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'}`}
                >
                  {providerData.isLive ? 'STOP BROADCASTING' : 'GO LIVE NOW'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
