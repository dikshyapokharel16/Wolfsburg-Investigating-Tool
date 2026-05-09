import { create } from 'zustand'

export const useMapStore = create((set) => ({
  activeLayers: {
    amenities: false,
    districts: true,
    movement: false,
    pedestrianNetwork: false,
    cyclingNetwork: false,
    cycleParking: false,
    busStops: false,
    publicSpaces: false,
  },
  selectedDistrict: null,
  selectedCategory: 'all',
  amenityData: [],
  isLoadingAmenities: false,
  pedestrianData: null,
  cyclingData: null,
  cycleParkingData: null,
  busStopsData: null,
  isLoadingPedestrian: false,
  isLoadingCycling: false,
  isLoadingCycleParking: false,
  isLoadingBusStops: false,

  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: !state.activeLayers[layer],
      },
    })),

  setSelectedDistrict: (district) => set({ selectedDistrict: district }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setAmenityData: (data) => set({ amenityData: data }),
  setLoadingAmenities: (val) => set({ isLoadingAmenities: val }),
  setPedestrianData: (data) => set({ pedestrianData: data }),
  setCyclingData: (data) => set({ cyclingData: data }),
  setCycleParkingData: (data) => set({ cycleParkingData: data }),
  setBusStopsData: (data) => set({ busStopsData: data }),
  setLoadingPedestrian: (val) => set({ isLoadingPedestrian: val }),
  setLoadingCycling: (val) => set({ isLoadingCycling: val }),
  setLoadingCycleParking: (val) => set({ isLoadingCycleParking: val }),
  setLoadingBusStops: (val) => set({ isLoadingBusStops: val }),
}))
