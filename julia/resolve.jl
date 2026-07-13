using Pkg

Pkg.activate(@__DIR__)
Pkg.add(PackageSpec(name = "OrdinaryDiffEq", version = "6"))
Pkg.add(PackageSpec(name = "JSON", version = "0.21"))
Pkg.resolve()
Pkg.instantiate()
