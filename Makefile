
JAVACFLAGS = -Xlint:all -Xlint:-serial -Werror

# HACK: Make's syntax is... simplicistic.
SPACE := $(subst ,, )

PLUGIN_NAMES := $(patsubst src/%,%,$(wildcard src/*))
PLUGIN_ARCHIVES := $(patsubst %,out/%.jar,$(PLUGIN_NAMES))
PLUGIN_CLASSPATH := $(subst $(SPACE),:,$(patsubst %,../%,$(PLUGIN_NAMES)))

.PHONY: all clean

.SECONDARY:
.DELETE_ON_ERROR:
.SECONDEXPANSION:

all: $(PLUGIN_ARCHIVES)

clean:
	rm -rf build/ out/

build out:
	mkdir $@

build/%.jar: $$(shell find src/$$* -name '*.java' 2>/dev/null) | build
	find src/$* -name '*.class' -exec rm {} +
	cd src/$* && find . -name '*.java' -print0 | xargs -0r \
	    javac -cp $(CLASSPATH):$(PLUGIN_CLASSPATH) $(JAVACFLAGS)
	cd src/$* && jar cf ../../build/$*.jar META-INF/MANIFEST.MF \
	    $$(find . -name '*.class')

out/%.jar: build/%.jar $$(shell find src/$$* lib/$$* -type f 2>/dev/null) \
    | out
	cp build/$*.jar out/$*.jar
	cd src/$* && jar uf ../../out/$*.jar $$(find . -type f -not -path \
	    './META-INF/MANIFEST.MF')
	[ -d lib/$* ] && cd lib/$* && jar uf ../../out/$*.jar $$(find . \
	    -type f -not -path './META-INF/MANIFEST.MF') || true
	    cd src/$* && [ -f META-INF/MANIFEST.MF ] && \
	jar ufm ../../out/$*.jar META-INF/MANIFEST.MF || true
