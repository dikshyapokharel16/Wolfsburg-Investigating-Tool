import { create } from 'zustand'

export const useMapStore = create((set) => ({
  activeLayers: {
    amenities: false,
    districts: true,
    movement: false,
    publicSpaces: false,
    frequencyAnalysis: false,
    googleActivity: false,
    dwellInfrastructure: false,
    closures: false,
    vacantPlaces: false,
    aerialView: false,
  },
  closureYear: 2021,
  selectedDistrict: null,
  selectedCategory: 'all',
  amenityData: [],
  isLoadingAmenities: false,
  choroplethLayers: {
    density: false,
    avgAge: false,
    rentPerSqm: false,
  },
  monochromeMode: false,

  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: !state.activeLayers[layer],
      },
    })),

  toggleChoropleth: (param) =>
    set((state) => ({
      choroplethLayers: {
        ...state.choroplethLayers,
        [param]: !state.choroplethLayers[param],
      },
    })),

  toggleMonochrome: () =>
    set((state) => ({ monochromeMode: !state.monochromeMode })),

  setClosureYear: (year) => set({ closureYear: year }),

  setSelectedDistrict: (district) => set({ selectedDistrict: district }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setAmenityData: (data) => set({ amenityData: data }),
  setLoadingAmenities: (val) => set({ isLoadingAmenities: val }),
}))
