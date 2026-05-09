import { create } from 'zustand'

export const useMapStore = create((set) => ({
  activeLayers: {
    amenities: false,
    districts: true,
    movement: false,
    publicSpaces: false,
  },
  selectedDistrict: null,
  selectedCategory: 'all',
  amenityData: [],
  isLoadingAmenities: false,
  choroplethLayers: {
    density: false,
    avgAge: false,
    rentPerSqm: false,
  },

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

  setSelectedDistrict: (district) => set({ selectedDistrict: district }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setAmenityData: (data) => set({ amenityData: data }),
  setLoadingAmenities: (val) => set({ isLoadingAmenities: val }),
}))
